/**
 * BILTIX Risk AI — application bootstrap (app shell wiring).
 *
 * Order of work (docs/ARCHITECTURE.md §9, §12, §B7; v3 CONTRACT §3.1, §4, §5):
 *   i18n (shell dictionary now; enums + English data dictionaries lazily) → optional modules →
 *   settings → art mount → grouped rail / tab bar → filters → activity panel → clock → data status
 *   chip → consolidated score pill → notifications (bell, banner, one assertive live region) →
 *   language switch → theme & rail toggles → command palette → router → live engines.
 *
 * Language: every shell string comes from js/i18n/core.js ('core' + 'status' namespaces). On
 * bus 'lang:change' the shell re-renders its chrome (rail, tab bar, filters, palette, banners,
 * activity panel, data chip, toasts) and the router re-mounts the current view keeping params and
 * scroll. ?lang=ar|en is honoured on load (applied, persisted, then removed from the URL).
 *
 * Honest status (CONTRACT §5): the app-bar data chip comes from js/core/status.js ("Demo · local
 * data" / Live / Stale / Error / Not connected, plus Offline from navigator.onLine) with a popover
 * explaining what is simulated and that data lives only in this browser. No shell text claims a
 * live connection; simulated alerts and events are labelled as simulated.
 *
 * Resilience: the core is imported statically; charts / radar / art / live / sources / psel /
 * platformLive / enums are loaded through guarded dynamic imports so a missing or broken module
 * degrades to a stub (one console.warn, never console.error). Data and user input reach the DOM
 * through textContent / setAttribute only — no innerHTML in this file.
 */
import { store } from './core/store.js';
import { bus } from './core/bus.js';
import { fmt } from './core/fmt.js';
import { sel } from './core/selectors.js';
import { router } from './core/router.js';
import { i18n, t, tn, L } from './core/i18n.js';
import { status } from './core/status.js';
import coreDict, { status as statusDict } from './i18n/core.js';
import * as components from './ui/components.js';
import { navGroups, views as navViews, loadView, navMeta, groupLabel, TAB_IDS, DEFAULT_VIEW, FALLBACK_VIEW } from './views/index.js';

i18n.register('core', coreDict);
i18n.register('status', statusDict);

const { h, clear, glyph, badge, button, toast, drawer, segmented, emptyState } = components;
const motion = components.motion && typeof components.motion === 'object' ? components.motion : null;

/* Optional modules — assigned by loadOptionalModules() before boot() touches them. */
let charts = {};
let radar = {};
let art = {};
let live = null;
let sources = null;
let psel = null;
let platformLive = null;
/** Ordered view entries (static nav metadata; `render` attached once a module is imported). */
let views = [];
const missingModules = [];
/** Latin code tokens inside free text (AIR-1042, CT-2026-014, PTW-5521, R-1001 …); U+2011 hyphens from the live engines match too. */
const CODE_TOKEN_RE = /\b[A-Z]{1,5}[-‑][A-Z0-9‑-]*\d[A-Z0-9‑-]*\b/g;
/** Digit runs that stand alone (not glued to Latin letters such as H2S, PM2.5, O2) follow the numerals setting. */
const STANDALONE_DIGITS_RE = /(?<![A-Za-z0-9.])\d+(?:[.,]\d+)?(?![A-Za-z])/g;
const ARABIC_RE = /[؀-ۿ]/;

const APP_VERSION = '3.0.0';
const RIYADH_TZ = 'Asia/Riyadh';
const FEED_CAP = 200;
const ALERT_CAP = 30;
const BANNER_MS = 12000;
const PANEL_PIN_MIN = 1680;
const UI_PREFS_KEY = 'biltix-hse:ui';
const TONES = ['neutral', 'good', 'warning', 'serious', 'critical', 'brand', 'accent'];
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RATINGS = ['red', 'yellow', 'green'];
const RATING_TONES = { red: 'critical', yellow: 'warning', green: 'good' };
const DEFAULT_COMPANY = 'بلتكس';

/* ------------------------------------------------------------------ */
/* Optional modules                                                    */
/* ------------------------------------------------------------------ */

async function optionalModule(path, pickExport) {
  try {
    const mod = await import(path);
    const value = typeof pickExport === 'function' ? pickExport(mod) : mod;
    if (value === null || value === undefined) throw new Error('expected export not found');
    return value;
  } catch (err) {
    missingModules.push(`${path} — ${err && err.message ? err.message : err}`);
    return null;
  }
}

/** Enum labels (js/i18n/enums.js, owner A-DATA-EN): { ar: { enum: {…} }, en: { enum: {…} } } or { ar: {…}, en: {…} }. */
function registerEnums(dict) {
  if (!dict || typeof dict !== 'object') return;
  const unwrap = (side) => (side && typeof side === 'object' && side.enum && typeof side.enum === 'object' ? side.enum : side);
  i18n.register('enum', { ar: unwrap(dict.ar), en: unwrap(dict.en) });
}

async function loadOptionalModules() {
  const [c, r, a, l, s, p, pl, en] = await Promise.all([
    optionalModule('./ui/charts.js', (m) => m.charts || m.default),
    optionalModule('./ui/radar.js', (m) => m),
    optionalModule('./ui/art.js', (m) => m.art || m.default),
    optionalModule('./data/live.js', (m) => m.live || m.default),
    optionalModule('./data/sources.js', (m) => m.sources || m.default),
    optionalModule('./core/platform-selectors.js', (m) => m.psel || m.default),
    optionalModule('./data/platform-live.js', (m) => m.platformLive || m.default),
    optionalModule('./i18n/enums.js', (m) => m.default || m.enums),
  ]);
  charts = c || {}; radar = r || {}; art = a || {}; live = l; sources = s; psel = p; platformLive = pl;
  registerEnums(en);
  if (missingModules.length) {
    console.warn(`[BILTIX Risk AI] ${missingModules.length} ${t('core.errors.modulesMissing')}:\n  • ${missingModules.join('\n  • ')}`);
  }
}

/* Rating helpers: psel is the single definition of the rating; labels come from the dictionaries. */
function ratingOf(score) {
  try { if (psel && typeof psel.rating === 'function') return psel.rating(score); } catch { /* fall through */ }
  const n = Number(score) || 0;
  return n >= 70 ? 'red' : n >= 40 ? 'yellow' : 'green';
}
function ratingLabel(rating) {
  const key = `enum.rating.${rating}`;
  if (i18n.has(key, i18n.lang())) return i18n.label('rating', rating);
  return t(`core.rating.${rating}`);
}
function ratingTone(rating) {
  try { if (psel && typeof psel.ratingTone === 'function') { const tone = psel.ratingTone(rating); if (TONES.includes(tone)) return tone; } } catch { /* fall through */ }
  return RATING_TONES[rating] || 'neutral';
}
const platformState = () => (store.state && store.state.platform && typeof store.state.platform === 'object' ? store.state.platform : {});
const platformList = (key) => (Array.isArray(platformState()[key]) ? platformState()[key] : []);

/*
 * Provisional debug hooks (§12): the core is ready as soon as this module evaluates, so the QA
 * harness / devtools can call store.setSettings({theme}) or i18n.setLang('en') while the optional
 * modules are still loading; boot() replaces this with the frozen, complete object.
 */
window.biltix = { store, bus, router, sel, fmt, i18n, status, motion, live: null, psel: null, platformLive: null, ready: false, views: navViews };

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const toneOf = (tone) => (TONES.includes(tone) ? tone : 'neutral');
/** Effective motion preference: the settings override (html[data-motion]) wins over the OS query. */
const reducedMotion = () => {
  const forced = document.documentElement.getAttribute('data-motion');
  if (forced === 'reduce' || forced === 'reduced') return true;
  if (forced === 'full') return false;
  return components.reducedMotion();
};

function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}
function setAttr(el, name, value) {
  if (!el) return;
  if (value === null || value === undefined || value === false) el.removeAttribute(name);
  else if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value));
}

/* UI-only layout preferences (activity panel pin) — per device, never part of the data. */
function readUiPrefs() {
  try { const raw = localStorage.getItem(UI_PREFS_KEY); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function writeUiPrefs(patch) {
  try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ ...readUiPrefs(), ...patch })); } catch { /* storage unavailable */ }
}

/* Intervals that stop while the tab is hidden and tick once + restart when it is shown again. */
const pausableIntervals = new Set();
function pausableInterval(fn, ms) {
  const entry = { fn, ms, id: null };
  entry.start = () => { if (entry.id === null) entry.id = setInterval(fn, ms); };
  entry.stop = () => { if (entry.id !== null) { clearInterval(entry.id); entry.id = null; } };
  pausableIntervals.add(entry);
  if (!document.hidden) entry.start();
  return entry;
}
function installVisibilityManager() {
  document.addEventListener('visibilitychange', () => {
    for (const entry of pausableIntervals) {
      if (document.hidden) { entry.stop(); continue; }
      try { entry.fn(); } catch (err) { reportError(err, 'visibility:tick'); }
      entry.start();
    }
  });
}

/* Input modality (keyboard vs pointer) → <html data-input> so focus rings show only for keyboard users. */
function trackInputModality() {
  const root = document.documentElement;
  const set = (mode) => { if (root.getAttribute('data-input') !== mode) root.setAttribute('data-input', mode); };
  set('pointer');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || (typeof e.key === 'string' && e.key.startsWith('Arrow'))) set('keyboard');
  }, true);
  document.addEventListener('pointerdown', () => set('pointer'), true);
}

/** Digits inside free text follow the numerals setting (identity for Western digits). */
function localizeText(s) {
  try { return fmt.digits('0') === '0' ? s : String(s).replace(STANDALONE_DIGITS_RE, (m) => fmt.digits(m)); } catch { return s; }
}

/**
 * Text → nodes: Latin code tokens (AIR-1042, CT-2026-014 …) are wrapped in
 * <span class="code mono nowrap" dir="ltr"> so they never break across lines or flip inside
 * Arabic sentences; the remaining digits are localised. textContent-safe (no HTML parsing).
 */
function richText(value) {
  const str = String(value == null ? '' : value);
  const frag = document.createDocumentFragment();
  let last = 0;
  CODE_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = CODE_TOKEN_RE.exec(str))) {
    if (m.index > last) frag.appendChild(document.createTextNode(localizeText(str.slice(last, m.index))));
    frag.appendChild(h('span', { class: 'code mono nowrap', dir: 'ltr', translate: 'no' }, m[0].replace(/‑/g, '-')));
    last = m.index + m[0].length;
  }
  if (last < str.length) frag.appendChild(document.createTextNode(localizeText(str.slice(last))));
  return frag;
}

/** Plain-text twin of richText (for aria-labels / live regions): U+2011 hyphens in codes become '-'. */
function plainCodes(value) {
  return String(value == null ? '' : value).replace(CODE_TOKEN_RE, (m) => m.replace(/‑/g, '-'));
}

/** Subscribe helper that tolerates a bus without `on` and always returns an unsubscribe fn. */
function on(event, handler) {
  try {
    const off = bus.on(event, (payload) => { try { handler(payload); } catch (err) { reportError(err, event); } });
    return typeof off === 'function' ? off : () => bus.off && bus.off(event, handler);
  } catch (err) { reportError(err, event); return () => {}; }
}

const settings = () => (store.state && store.state.settings) || {};
const filters = () => store.filters || (store.state && store.state.filters) || { siteId: 'all', range: 30, search: '' };
const siteById = (id) => ((store.state && store.state.sites) || []).find((s) => s.id === id) || null;
const siteName = (site) => (site ? String(L(site, 'name', 'sites') || site.name || '') : '');
const isEn = () => i18n.lang() === 'en';

/** A data string in the active language: mirror / *En field / terms; in English never fall back to Arabic when `english` is required. */
function dataText(record, field, ns) {
  if (!record) return '';
  const value = L(record, field, ns);
  if (typeof value === 'string' && isEn() && value === record[field]) return i18n.term(value);
  return value == null ? '' : String(value);
}

function iconFor(name, size = 18, fallbackTone = 'neutral') {
  let node = null;
  try { node = art && typeof art.icon === 'function' ? art.icon(name, size) : null; } catch { node = null; }
  if (!(node instanceof Node)) node = glyph(fallbackTone, size);
  if (node.setAttribute) {
    node.setAttribute('width', String(size)); node.setAttribute('height', String(size));
    node.setAttribute('aria-hidden', 'true'); node.setAttribute('focusable', 'false'); node.classList.add('icon');
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* Error surface (window error / unhandledrejection → toast)           */
/* ------------------------------------------------------------------ */

const reportedErrors = new Set();
function reportError(err, context = '') {
  const message = err && err.message ? err.message : String(err || t('core.errors.unknown'));
  const key = `${context}|${message}`;
  if (reportedErrors.has(key)) return;
  reportedErrors.add(key);
  console.error(context ? `[BILTIX Risk AI] ${context}:` : '[BILTIX Risk AI]', err);
  try {
    toast(t('core.errors.toast'), { tone: 'serious', timeout: 7000, title: t('core.errors.toastTitle') });
  } catch { /* toast host not ready */ }
}

window.addEventListener('error', (e) => { reportError(e.error || e.message, 'window.error'); });
window.addEventListener('unhandledrejection', (e) => { reportError(e.reason, 'unhandledrejection'); });

/* ------------------------------------------------------------------ */
/* Language: initial resolution (?lang= > saved settings > <html lang>) */
/* ------------------------------------------------------------------ */

/** ?lang=ar|en from the query string or the hash query; removed from the URL once applied. */
function takeUrlLang() {
  let lang = null;
  try {
    const url = new URL(location.href);
    const q = url.searchParams.get('lang');
    if (q === 'ar' || q === 'en') lang = q;
    if (url.searchParams.has('lang')) url.searchParams.delete('lang');
    let hash = url.hash;
    const qi = hash.indexOf('?');
    if (qi !== -1) {
      const hp = new URLSearchParams(hash.slice(qi + 1));
      const hq = hp.get('lang');
      if (!lang && (hq === 'ar' || hq === 'en')) lang = hq;
      if (hp.has('lang')) {
        hp.delete('lang');
        const rest = hp.toString();
        hash = `${hash.slice(0, qi)}${rest ? `?${rest}` : ''}`;
      }
    }
    url.hash = hash;
    if (url.href !== location.href) history.replaceState(history.state, '', url.href);
  } catch { /* old browser: keep the URL */ }
  return lang;
}

const initialLang = takeUrlLang() || (settings().lang === 'en' || settings().lang === 'ar' ? settings().lang : null) || i18n.lang();
i18n.attach({ store, lang: initialLang });

/* ------------------------------------------------------------------ */
/* Settings → document                                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_BRAND = { primary: '', accent: '', companyName: DEFAULT_COMPANY, logoUrl: '' }; // empty = use css/tokens.css values
let appliedNumerals = null;
/** settings.calendar values (same list as store.js CALENDAR_MODES; store.normalizeSettings defaults to 'both'). */
const CALENDAR_MODES = Object.freeze(['gregorian', 'hijri', 'both']);
let appliedCalendar = null;

function calendarMode(s = settings()) {
  const c = s && typeof s === 'object' ? s.calendar : undefined;
  return CALENDAR_MODES.includes(c) ? c : 'both';
}

function applySettings(s = settings()) {
  const root = document.documentElement;
  const theme = s.theme === 'light' ? 'light' : 'dark';
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);

  const brand = { ...DEFAULT_BRAND, ...(s.brand || {}) };
  applyBrandColors(brand);
  syncThemeColorMeta();

  const numerals = s.numerals === 'arab' ? 'arab' : 'latn';
  setAttr(root, 'data-numerals', numerals);
  if (numerals !== appliedNumerals) {
    appliedNumerals = numerals;
    try { fmt.setNumerals(numerals); } catch (err) { reportError(err, 'fmt.setNumerals'); }
    rebuildClockFormatters();
  }
  // settings.calendar (Settings → Language & region): the app-bar date follows it at once.
  const calendar = calendarMode(s);
  if (calendar !== appliedCalendar) {
    appliedCalendar = calendar;
    lastDateKey = '';
    renderClockDates();
  }

  // settings.motion: 'auto' (follow the OS) | 'reduce' | 'full' — legacy boolean settings.reducedMotion maps to 'reduce'.
  const motionPref = s.motion === 'reduce' || s.motion === 'full' ? s.motion : (s.reducedMotion ? 'reduce' : 'auto');
  if (motionPref === 'auto') root.removeAttribute('data-motion'); else setAttr(root, 'data-motion', motionPref);
  // settings.appearance (A-DATA): background static|subtle|cinematic, density comfortable|compact.
  const ap = s.appearance && typeof s.appearance === 'object' ? s.appearance : {};
  setAttr(root, 'data-bg', ap.background === 'static' || ap.background === 'cinematic' ? ap.background : 'subtle');
  setAttr(root, 'data-density', ap.density === 'compact' ? 'compact' : 'comfortable');

  document.body.classList.toggle('rail-collapsed', !!s.railCollapsed);
  document.body.classList.toggle('feed-paused', !!s.feedPaused);
  syncThemeButton();
  syncRailToggle();
  syncRailTooltips();
  applyBrandText(brand);
  syncActivityPause();
}

function syncThemeButton() {
  const themeBtn = $('themeBtn');
  if (!themeBtn) return;
  const light = settings().theme === 'light';
  setAttr(themeBtn, 'aria-pressed', light ? 'true' : 'false');
  const label = light ? t('core.shell.themeToDark') : t('core.shell.themeToLight');
  setAttr(themeBtn, 'aria-label', label);
  setAttr(themeBtn, 'title', label);
}

function syncRailToggle() {
  const railToggle = $('railToggle');
  if (!railToggle) return;
  if (narrowQuery().matches) {
    const open = document.body.classList.contains('rail-open');
    setAttr(railToggle, 'aria-expanded', open ? 'true' : 'false');
    setAttr(railToggle, 'aria-label', open ? t('core.nav.closeMenu') : t('core.nav.openMenu'));
    return;
  }
  const collapsed = !!settings().railCollapsed;
  setAttr(railToggle, 'aria-expanded', collapsed ? 'false' : 'true');
  setAttr(railToggle, 'aria-label', collapsed ? t('core.nav.expand') : t('core.nav.collapse'));
}

function normalizeHex(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '';
  let v = m[1].toLowerCase();
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  return `#${v}`;
}

/**
 * Brand colours: '' (the default) means "use the theme tokens" — nothing is written inline, so
 * the light theme keeps its own accent. A hex is applied only when it differs from the current
 * theme's token value.
 */
function applyBrandColors(brand) {
  const root = document.documentElement;
  root.style.removeProperty('--brand');
  root.style.removeProperty('--accent');
  let computed = null;
  try { computed = getComputedStyle(root); } catch { computed = null; }
  const apply = (prop, value) => {
    const hex = normalizeHex(value);
    if (!hex || !HEX_RE.test(hex)) return;
    const themeDefault = computed ? normalizeHex(computed.getPropertyValue(prop)) : '';
    if (hex !== themeDefault) root.style.setProperty(prop, hex);
  };
  apply('--brand', brand.primary);
  apply('--accent', brand.accent);
}

/** Browser chrome color follows the page plane token (no hard-coded colors in JS). */
function syncThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) return;
  try {
    const plane = getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim();
    if (plane) meta.setAttribute('content', plane);
  } catch { /* computed styles unavailable before first paint */ }
}

/** Product name: the dictionary name unless the company name was customised in settings. */
function productName(brand = { ...DEFAULT_BRAND, ...(settings().brand || {}) }) {
  const company = String(brand.companyName || '').trim();
  if (!company || company === DEFAULT_COMPANY || /^biltix$/i.test(company)) return t('core.app.name');
  return `${company} Risk AI`;
}

function applyBrandText(brand) {
  setText($('brandName'), productName(brand));
  setText($('brandTag'), t('core.app.tagline'));
  setAttr($('brandLink'), 'aria-label', t('core.app.homeAria'));
  const mark = document.querySelector('.brand-mark');
  if (!mark) return;
  const wantsImage = typeof brand.logoUrl === 'string' && /^https?:\/\//i.test(brand.logoUrl.trim());
  if (wantsImage) {
    if (mark.dataset.mode !== 'image' || mark.dataset.src !== brand.logoUrl) {
      clear(mark);
      mark.appendChild(h('img', { src: brand.logoUrl.trim(), alt: '', width: '36', height: '36', decoding: 'async', referrerpolicy: 'no-referrer' }));
      mark.dataset.mode = 'image'; mark.dataset.src = brand.logoUrl;
    }
  } else if (mark.dataset.mode !== 'art') {
    clear(mark);
    mountLogo(mark);
    mark.dataset.mode = 'art'; delete mark.dataset.src;
  }
}

/* ------------------------------------------------------------------ */
/* Architectural art mount                                             */
/* ------------------------------------------------------------------ */

function mountLogo(target) {
  let node = null;
  try { node = art && typeof art.logoMark === 'function' ? art.logoMark(36) : null; } catch (err) { reportError(err, 'art.logoMark'); }
  if (node instanceof Node) target.appendChild(node);
  else target.appendChild(glyph('brand', 36));
}

function mountBackdrop() {
  const host = $('backdrop');
  if (!host) return;
  let node = null;
  try { node = art && typeof art.backdrop === 'function' ? art.backdrop() : null; } catch (err) { reportError(err, 'art.backdrop'); }
  if (node instanceof Node) { clear(host); host.appendChild(node); }
}

/* ------------------------------------------------------------------ */
/* Static chrome strings ([data-i18n], skip link, labels)               */
/* ------------------------------------------------------------------ */

function localizeStaticChrome() {
  document.querySelectorAll('[data-i18n]').forEach((el) => setText(el, t(el.getAttribute('data-i18n'))));
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => setAttr(el, 'aria-label', t(el.getAttribute('data-i18n-aria'))));
  setAttr($('rail'), 'aria-label', t('core.nav.aria'));
  setAttr($('tabbar'), 'aria-label', t('core.nav.tabsAria'));
  setAttr($('alertBanner'), 'aria-label', t('core.alerts.bannerAria'));
  setAttr($('cmdkBtn'), 'aria-label', t('core.shell.searchAria'));
  setAttr($('cmdkPanel'), 'aria-label', t('core.cmdk.dialogAria'));
  setText($('cmdkInputLabel'), t('core.cmdk.inputLabel'));
  setAttr($('cmdkInput'), 'placeholder', t('core.cmdk.placeholder'));
  setAttr($('cmdkList'), 'aria-label', t('core.cmdk.results'));
  setText($('cmdkFootNav'), t('core.cmdk.navigate'));
  setText($('cmdkFootRun'), t('core.cmdk.run'));
  setText($('cmdkFootClose'), t('core.cmdk.close'));
  setText($('railVersion'), `v${APP_VERSION}`);
  const user = $('userChip');
  const name = t('core.user.name');
  setText($('userName'), name);
  setText($('userRole'), t('core.user.role'));
  setText($('userAvatar'), t('core.user.initial'));
  setAttr(user, 'aria-label', t('core.user.aria', { name }));
  setAttr(user, 'title', t('core.user.roleTitle'));
  syncThemeButton();
  syncRailToggle();
  syncLangSwitch();
}

/* ------------------------------------------------------------------ */
/* Navigation rail (grouped, §B7) & bottom tab bar                     */
/* ------------------------------------------------------------------ */

const railButtons = new Map();
const tabButtons = new Map();
let moreDrawer = null;

const viewById = (id) => views.find((v) => v.id === id) || null;

/** navGroups resolved against the views that actually loaded (empty groups dropped). */
function resolvedGroups(pool = views) {
  const poolIds = new Set(pool.map((v) => v.id));
  const groups = navGroups
    .map((g) => ({ id: g.id, label: g.label, viewIds: g.viewIds, members: g.viewIds.map((id) => pool.find((v) => v.id === id)).filter(Boolean) }))
    .filter((g) => g.members.length);
  const grouped = new Set(navGroups.flatMap((g) => g.viewIds));
  const rest = pool.filter((v) => !grouped.has(v.id) && poolIds.has(v.id));
  if (rest.length) groups.push({ id: 'other', label: groupLabel('other'), viewIds: rest.map((v) => v.id), members: rest });
  return groups;
}

/** Warm a lazy view module on hover / focus so the click paints instantly. */
function prefetchView(id) {
  try { const p = loadView(id); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch { /* ignore */ }
}

function navItem(view, { compact = false } = {}) {
  const meta = navMeta(view);
  const label = compact ? meta.tabTitle : meta.title;
  const btn = h('button', {
    type: 'button', class: compact ? 'tab-item' : 'rail-item', 'data-view': view.id,
    // Rail: the visible label is the full title (wraps to two lines, never truncated); the accessible
    // name stays the title even when the label is hidden in the collapsed rail.
    'aria-label': compact ? undefined : meta.title,
    onClick: () => router.navigate(view.id),
    onPointerenter: () => prefetchView(view.id), onFocus: () => prefetchView(view.id),
  });
  btn.dataset.tooltip = `${meta.title}${meta.code ? ` · ${meta.code}` : ''}`;
  btn.appendChild(h('span', { class: compact ? 'tab-icon' : 'rail-icon', 'aria-hidden': 'true' }, iconFor(view.icon, compact ? 22 : 20)));
  btn.appendChild(h('span', { class: compact ? 'tab-label' : 'rail-label' }, label));
  if (!compact) btn.appendChild(h('span', { class: 'rail-code mono', 'aria-hidden': 'true', translate: 'no' }, meta.code));
  return btn;
}

/** Which nav button had focus inside `host` (so a rebuild in the new language can restore it). */
function focusedNavKey(host) {
  const el = document.activeElement;
  if (!host || !el || !host.contains(el)) return null;
  if (el.classList.contains('tab-more')) return '__more';
  return el.dataset && el.dataset.view ? el.dataset.view : null;
}
function restoreNavFocus(map, key) {
  if (!key) return;
  const btn = map.get(key);
  if (btn) btn.focus({ preventScroll: true });
}

function buildRail() {
  const list = $('railList');
  if (!list) return;
  const refocus = focusedNavKey(list);
  clear(list);
  railButtons.clear();
  resolvedGroups().forEach((group) => {
    const labelId = `railGroup-${group.id}`;
    const li = h('li', { class: 'rail-group', 'data-group': group.id });
    li.appendChild(h('div', { class: 'rail-group-label', id: labelId }, group.label));
    const ul = h('ul', { class: 'rail-group-list', role: 'list', 'aria-labelledby': labelId });
    group.members.forEach((view) => {
      const btn = navItem(view);
      railButtons.set(view.id, btn);
      ul.appendChild(h('li', { class: 'rail-li' }, btn));
    });
    li.appendChild(ul);
    list.appendChild(li);
  });
  syncRailTooltips();
  watchRailWidth();
  restoreNavFocus(railButtons, refocus);
}

/**
 * Native tooltips on rail items only while the rail shows icons without labels — collapsed by the
 * user (body.rail-collapsed) or by the layout (narrow widths): measured, not guessed from breakpoints.
 */
function railIsIconOnly() {
  const rail = $('rail');
  if (!rail) return false;
  if (document.body.classList.contains('rail-collapsed') && !narrowQuery().matches) return true;
  const label = rail.querySelector('.rail-label');
  if (!label) return false;
  const width = rail.getBoundingClientRect().width;
  return width > 0 && (width < 120 || label.getClientRects().length === 0);
}
function syncRailTooltips() {
  const iconOnly = railIsIconOnly();
  for (const btn of railButtons.values()) setAttr(btn, 'title', iconOnly ? btn.dataset.tooltip : null);
}
let railObserver = null;
function watchRailWidth() {
  const rail = $('rail');
  if (!rail || railObserver || typeof ResizeObserver !== 'function') return;
  let frame = 0;
  railObserver = new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; syncRailTooltips(); });
  });
  railObserver.observe(rail);
}

/** Bottom tab bar: cockpit, airisks, overview, radar (+ next available when one is missing) and "More". */
function buildTabbar() {
  const bar = $('tabbar');
  if (!bar) return;
  const refocus = focusedNavKey(bar);
  clear(bar);
  tabButtons.clear();
  const primary = TAB_IDS.map(viewById).filter(Boolean);
  for (const view of views) {
    if (primary.length >= TAB_IDS.length) break;
    if (!primary.includes(view)) primary.push(view);
  }
  const rest = views.filter((v) => !primary.includes(v));
  primary.forEach((view) => { const b = navItem(view, { compact: true }); tabButtons.set(view.id, b); bar.appendChild(b); });
  const more = h('button', { type: 'button', class: 'tab-item tab-more', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onClick: () => openMoreSheet(rest, more) });
  more.appendChild(h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, glyph('grip', 22)));
  more.appendChild(h('span', { class: 'tab-label' }, t('core.nav.more')));
  bar.appendChild(more);
  tabButtons.set('__more', more);
  const cur = router.current ? router.current() : null;
  if (cur && cur.id) markActive(cur.id);
  restoreNavFocus(tabButtons, refocus);
}

/** Language + theme quick settings (phones: the app bar has no room for every control). */
function quickSettings(onDone) {
  const wrap = h('div', { class: 'sheet-quick', role: 'group', 'aria-label': t('core.shell.quickSettings') });
  wrap.appendChild(h('div', { class: 'sheet-group-label' }, t('core.shell.quickSettings')));
  const row = h('div', { class: 'sheet-quick-row' });
  row.appendChild(langSwitchControl({ onSwitch: onDone }));
  const light = settings().theme === 'light';
  row.appendChild(button(light ? t('core.shell.themeToDark') : t('core.shell.themeToLight'), {
    variant: 'outline', size: 'sm', icon: iconFor(light ? 'moon' : 'sunny', 16), onClick: () => { toggleTheme(); if (typeof onDone === 'function') onDone(); },
  }));
  wrap.appendChild(row);
  return wrap;
}

function openMoreSheet(rest, anchor) {
  if (moreDrawer && moreDrawer.isOpen()) { moreDrawer.close(); return; }
  const current = router.current ? router.current() : { id: null };
  const body = h('div', { class: 'sheet-body' });
  body.appendChild(quickSettings(() => { if (moreDrawer && moreDrawer.isOpen()) moreDrawer.close(); }));
  const list = h('ul', { class: 'sheet-list', role: 'list' });
  resolvedGroups(rest).forEach((group) => {
    list.appendChild(h('li', { class: 'sheet-group', role: 'presentation' }, h('div', { class: 'sheet-group-label' }, group.label)));
    group.members.forEach((view) => {
      const meta = navMeta(view);
      const b = h('button', {
        type: 'button', class: ['sheet-item', current.id === view.id ? 'is-active' : null], 'aria-current': current.id === view.id ? 'page' : undefined,
        onClick: () => { moreDrawer.close(); router.navigate(view.id); },
        onPointerenter: () => prefetchView(view.id), onFocus: () => prefetchView(view.id),
      });
      b.appendChild(h('span', { class: 'sheet-icon', 'aria-hidden': 'true' }, iconFor(view.icon, 20)));
      b.appendChild(h('span', { class: 'sheet-label' }, meta.title));
      b.appendChild(h('span', { class: 'sheet-code mono', 'aria-hidden': 'true', translate: 'no' }, meta.code));
      list.appendChild(h('li', {}, b));
    });
  });
  body.appendChild(list);
  anchor.setAttribute('aria-expanded', 'true');
  moreDrawer = drawer({ title: t('core.nav.moreTitle'), subtitle: t('core.nav.moreSub'), body, onClose: () => anchor.setAttribute('aria-expanded', 'false') });
  moreDrawer.el.classList.add('is-sheet');
  moreDrawer.open();
}

function markActive(id) {
  for (const [key, btn] of railButtons) {
    const active = key === id;
    if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    btn.classList.toggle('is-active', active);
  }
  const inPrimary = tabButtons.has(id);
  for (const [key, btn] of tabButtons) {
    const active = key === id || (key === '__more' && !inPrimary && id);
    if (active) btn.setAttribute('aria-current', key === '__more' ? 'true' : 'page'); else btn.removeAttribute('aria-current');
    btn.classList.toggle('is-active', !!active);
  }
  document.body.dataset.view = id || '';
}

/* ------------------------------------------------------------------ */
/* Global filters row                                                  */
/* ------------------------------------------------------------------ */

const RANGES = [7, 30, 90];
let rangeSeg = null;
let filtersWired = false;

const rangeLabel = (days) => tn('core.filters.days', days);

function fillSiteOptions() {
  const site = $('siteSelect');
  if (!site) return;
  const value = filters().siteId || 'all';
  clear(site);
  site.appendChild(h('option', { value: 'all' }, t('core.filters.allProjects')));
  ((store.state && store.state.sites) || []).forEach((s) => {
    site.appendChild(h('option', { value: s.id }, `${s.code} — ${siteName(s)}`));
  });
  site.value = value;
}

function buildRange() {
  const rangeHost = $('rangeSeg');
  if (!rangeHost) return;
  clear(rangeHost);
  rangeSeg = segmented({
    options: RANGES.map((d) => ({ value: d, label: rangeLabel(d) })),
    value: Number(filters().range) || 30,
    ariaLabel: t('core.filters.periodAria'),
    onChange: (v) => store.setFilter('range', Number(v)),
  });
  rangeHost.appendChild(rangeSeg.el);
}

/** Labels of the filter row in the active language (also rebuilds options and the range control). */
function localizeFilters() {
  setAttr($('filters'), 'aria-label', t('core.filters.aria'));
  setText($('siteLabel'), t('core.filters.project'));
  setAttr($('siteSelect'), 'aria-label', t('core.filters.projectAria'));
  setText($('rangeLabel'), t('core.filters.period'));
  setText($('searchLabel'), t('core.filters.searchLabel'));
  setAttr($('searchInput'), 'placeholder', t('core.filters.searchPlaceholder'));
  setAttr($('searchInput'), 'title', t('core.filters.searchTitle'));
  fillSiteOptions();
  buildRange();
}

function buildFilters() {
  localizeFilters();
  if (filtersWired) return;
  filtersWired = true;
  const site = $('siteSelect');
  if (site) site.addEventListener('change', () => store.setFilter('siteId', site.value || 'all'));

  const search = $('searchInput');
  if (search) {
    search.value = filters().search || '';
    const push = debounce((value) => store.setFilter('search', value.trim()), 200);
    search.addEventListener('input', () => push(search.value));
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { search.value = ''; push.cancel(); store.setFilter('search', ''); } });
  }

  on('filters:change', (payload) => {
    const f = (payload && payload.filters) || filters();
    const s = $('siteSelect');
    if (s && s.value !== String(f.siteId || 'all')) s.value = String(f.siteId || 'all');
    if (rangeSeg) rangeSeg.set(Number(f.range) || 30);
    if (search && document.activeElement !== search && search.value !== (f.search || '')) search.value = f.search || '';
  });
}

/* ------------------------------------------------------------------ */
/* Activity panel (collapsible; pinnable ≥ 1680 px)                     */
/* ------------------------------------------------------------------ */

const FEED_ICONS = {
  sensor: 'sensor', permit: 'permit', incident: 'incident', nearmiss: 'nearmiss', inspection: 'inspection',
  training: 'training', integration: 'integration', ppe: 'ppe', weather: 'weather', alert: 'alert', risk: 'risk',
  // Part B (§B6) event types
  ai: 'sparkle', validation: 'badge-check', connector: 'integration', writeback: 'refresh', task: 'file-check',
};
/** Where a click on a feed item of this type should go (platform events carry refId). */
const FEED_ROUTES = {
  ai: (ev) => ['airisks', { risk: ev.refId }],
  task: (ev) => ['tasks', { id: ev.refId }],
  writeback: (ev) => ['tasks', { id: ev.refId }],
  connector: () => ['integrations', {}],
  validation: () => ['dataquality', {}],
};
const feedTimes = new Set();
const panel = { open: false, pinned: false, unread: 0, unseen: 0, wired: false };
const wideQuery = () => window.matchMedia(`(min-width: ${PANEL_PIN_MIN}px)`);
const feedTypeLabel = (type) => t(`core.activity.types.${type}`);

/** Resolve a feed sourceId to a display name: Part A integrations, platform connectors or pipelines. */
function feedSourceName(sourceId) {
  if (!sourceId) return '';
  const integ = ((store.state && store.state.integrations) || []).find((i) => i && i.id === sourceId);
  if (integ) return dataText(integ, 'name', 'integrations');
  const conn = platformList('connectors').find((c) => c && c.id === sourceId);
  if (conn) return dataText(conn, 'name', 'connectors');
  const pipe = platformList('pipelines').find((p) => p && p.id === sourceId);
  if (pipe) return isEn() ? String(L(pipe, 'name', 'pipelines') || pipe.name || '') : (pipe.nameAr || pipe.name || '');
  return '';
}

/** Event text in the active language; English never shows untranslated Arabic copy (the type label stands in). */
function eventText(ev, field) {
  const value = L(ev, field, null);
  if (typeof value !== 'string' || !value) return '';
  if (isEn() && ARABIC_RE.test(value)) return '';
  return value;
}

function feedItem(ev, { fresh = false } = {}) {
  const tone = toneOf(ev.tone || 'neutral');
  const type = FEED_ICONS[ev.type] ? ev.type : 'alert';
  const route = FEED_ROUTES[type] && viewById(FEED_ROUTES[type](ev)[0]) && (type === 'connector' || type === 'validation' || ev.refId) ? FEED_ROUTES[type](ev) : null;
  const title = eventText(ev, 'title') || feedTypeLabel(type);
  const detail = eventText(ev, 'detail');
  const li = h('li', {
    class: ['feed-item', `tone-${tone}`, `type-${type}`, fresh ? 'is-new' : null, route ? 'is-clickable' : null],
    'data-id': ev.id || undefined, 'data-type': type, tabindex: route ? '0' : undefined, role: route ? 'link' : undefined,
    onClick: route ? () => { maybeCloseOverlayPanel(); router.navigate(route[0], route[1]); } : undefined,
    onKeydown: route ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); maybeCloseOverlayPanel(); router.navigate(route[0], route[1]); } } : undefined,
  });
  li.appendChild(h('span', { class: ['feed-tone', `tone-${tone}`], 'aria-hidden': 'true' }));
  li.appendChild(h('span', { class: 'feed-icon', 'aria-hidden': 'true' }, iconFor(FEED_ICONS[type], 16, tone)));
  const body = h('div', { class: 'feed-body' });
  const row = h('div', { class: 'feed-title-row' });
  // Codes stay LTR / unbroken, digits follow the numerals setting.
  row.appendChild(h('strong', { class: 'feed-title' }, richText(title)));
  const time = h('time', { class: 'feed-time mono', datetime: ev.ts || '' }, safeRelative(ev.ts));
  time.dataset.ts = ev.ts || '';
  feedTimes.add(time);
  row.appendChild(time);
  body.appendChild(row);
  if (detail) body.appendChild(h('p', { class: 'feed-detail' }, richText(detail)));
  const meta = h('div', { class: 'feed-meta' });
  meta.appendChild(h('span', { class: 'feed-type' }, feedTypeLabel(type)));
  const site = siteById(ev.siteId);
  if (site) meta.appendChild(h('span', { class: 'feed-site' }, siteName(site)));
  const sourceName = feedSourceName(ev.sourceId);
  if (sourceName) meta.appendChild(h('span', { class: 'feed-source' }, sourceName));
  // Events that carry a numeric reading render it through fmt — unless the sentence already spells it out.
  if (ev.value !== null && ev.value !== undefined && ev.value !== '' && Number.isFinite(Number(ev.value))) {
    const digits = Math.abs(Number(ev.value)) < 10 ? 1 : 0;
    const reading = fmt.num(Number(ev.value), { maximumFractionDigits: digits });
    const sentence = localizeText(`${title} ${detail}`);
    if (!sentence.includes(reading)) {
      let unit = ev.unit ? String(L(ev, 'unit', null) || '') : '';
      if (unit && unit === ev.unit) unit = i18n.label('unit', ev.unit);
      if (isEn() && ARABIC_RE.test(unit)) unit = '';
      meta.appendChild(h('span', { class: 'feed-value mono num' }, `${reading}${unit ? ` ${unit}` : ''}`));
    }
  }
  body.appendChild(meta);
  li.appendChild(body);
  if (route) li.setAttribute('aria-label', t('core.activity.itemAria', { type: feedTypeLabel(type), title: plainCodes(title) }));
  if (fresh) {
    const settle = () => li.classList.remove('is-new');
    if (reducedMotion()) settle();
    else { li.addEventListener('animationend', settle, { once: true }); setTimeout(settle, 900); }
  }
  return li;
}

function safeRelative(iso) {
  if (!iso) return '';
  try { return fmt.relative(iso); } catch { return ''; }
}

function pruneFeedTimes() {
  for (const el of feedTimes) if (!el.isConnected) feedTimes.delete(el);
}

function refreshFeedTimes() {
  pruneFeedTimes();
  for (const el of feedTimes) {
    const next = safeRelative(el.dataset.ts);
    if (el.textContent !== next) el.textContent = next;
  }
}

function updateFeedCount() {
  const list = $('feedList');
  if (!list) return;
  const n = list.querySelectorAll('.feed-item').length;
  setText($('feedCountValue'), fmt.num(n));
  setText($('feedCountLabel'), tn('core.activity.count', n));
}

/** (Re)build the list from the store (boot, language or numerals change). */
function renderFeedList() {
  const list = $('feedList');
  if (!list) return;
  clear(list);
  pruneFeedTimes();
  const existing = ((store.state && store.state.feed) || []).slice(0, FEED_CAP);
  const frag = document.createDocumentFragment();
  existing.forEach((ev) => frag.appendChild(feedItem(ev)));
  list.appendChild(frag);
  if (!existing.length) list.appendChild(h('li', { class: 'feed-empty' }, emptyState({ icon: glyph('accent', 28), title: t('core.activity.emptyTitle'), text: t('core.activity.emptyText') })));
  panel.unseen = 0;
  syncNewChip();
  updateFeedCount();
}

/**
 * The element that scrolls the event list: the list itself when the stylesheet makes it scrollable,
 * otherwise the panel (css decides; the shell measures instead of assuming).
 */
function feedScroller() {
  const list = $('feedList');
  if (!list) return null;
  try {
    const oy = getComputedStyle(list).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && list.scrollHeight > list.clientHeight + 1) return list;
  } catch { /* fall through */ }
  return $('activityPanel') || list;
}

/** Insert a new event without moving what the reader is looking at. */
function insertFeedEvent(ev) {
  const list = $('feedList');
  if (!list) return;
  const empty = list.querySelector('.feed-empty');
  if (empty) empty.remove();
  const scroller = feedScroller();
  const scrolled = Boolean(scroller) && scroller.scrollTop > 4;
  const visible = panel.open && !scrolled;
  // Every existing item shifts by the same amount when one is inserted above: measure the first one.
  const anchor = scrolled ? list.firstElementChild : null;
  const before = anchor ? anchor.getBoundingClientRect().top : 0;
  list.insertBefore(feedItem(ev, { fresh: visible }), list.firstChild);
  while (list.children.length > FEED_CAP) list.lastChild.remove();
  if (anchor && anchor.isConnected) {
    // Keep the anchor at the same on-screen position (whatever the browser's own scroll anchoring did).
    const delta = anchor.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 0.5) scroller.scrollTop += delta;
  }
  if (scrolled && panel.open) { panel.unseen += 1; syncNewChip(); }
  if (!panel.open) { panel.unread = Math.min(panel.unread + 1, 999); syncActivityToggle(); }
  pruneFeedTimes();
  updateFeedCount();
}

function syncNewChip() {
  const chip = $('activityNewChip');
  if (!chip) return;
  const show = panel.unseen > 0;
  chip.hidden = !show;
  if (show) {
    setText(chip, tn('core.activity.newChip', panel.unseen));
    setAttr(chip, 'aria-label', `${tn('core.activity.newChip', panel.unseen).replace(/\s*↑\s*$/, '')} — ${t('core.activity.newChipAria')}`);
  }
}

function syncActivityToggle() {
  const btn = $('activityToggle');
  const count = $('activityCount');
  const n = panel.unread;
  if (count) { count.hidden = n === 0; setText(count, n > 99 ? `${fmt.num(99)}+` : fmt.num(n)); }
  if (btn) {
    setAttr(btn, 'aria-expanded', panel.open ? 'true' : 'false');
    setAttr(btn, 'aria-label', t('core.activity.toggleAria', { unread: tn('core.activity.unread', n) }));
    setAttr(btn, 'title', panel.open ? t('core.activity.close') : t('core.activity.open'));
    btn.classList.toggle('has-unread', n > 0);
  }
}

function syncActivityPause() {
  const paused = !!settings().feedPaused;
  const btn = $('activityPause');
  if (btn) {
    setAttr(btn, 'aria-pressed', paused ? 'true' : 'false');
    setAttr(btn, 'aria-label', paused ? t('core.activity.resumeAria') : t('core.activity.pauseAria'));
    btn.classList.toggle('is-paused', paused);
    const dot = btn.querySelector('.live-dot');
    if (dot) dot.classList.toggle('is-paused', paused);
  }
  setText($('activityPauseLabel'), paused ? t('core.activity.resume') : t('core.activity.pause'));
  const p = $('activityPanel');
  if (p) p.classList.toggle('is-paused', paused);
  syncActivityFooter();
}

/** Footer text from the status taxonomy — never "connected to live systems". */
function syncActivityFooter() {
  const el = $('feedStatus');
  if (!el) return;
  let text;
  if (settings().feedPaused) text = t('core.activity.footerPaused');
  else if (status.mode(store.state) === 'demo') text = t('core.activity.footerDemo');
  else text = t('core.activity.footerLive', { status: status.label(status.source(store.state).status) });
  if (!status.online()) text = `${text} · ${t('core.data.offlineSuffix')}`;
  setText(el, text);
}

function localizeActivityPanel() {
  const p = $('activityPanel');
  setAttr(p, 'aria-label', t('core.activity.aria'));
  setText($('activityTitle'), t('core.activity.title'));
  setAttr($('feedList'), 'aria-label', t('core.activity.listAria'));
  setText($('feedAll'), t('core.activity.viewAll'));
  setAttr($('activityClose'), 'aria-label', t('core.activity.close'));
  setAttr($('activityClose'), 'title', t('core.activity.close'));
  syncPinButton();
  const mode = $('activityMode');
  if (mode) {
    clear(mode);
    const label = t('core.activity.simulatedBadge');
    let node = null;
    try { node = typeof components.statusBadge === 'function' ? components.statusBadge('demo', { label, size: 'sm' }) : null; } catch { node = null; }
    mode.appendChild(node instanceof Node ? node : badge(label, 'accent'));
  }
  syncActivityPause();
  syncActivityToggle();
  syncNewChip();
}

function syncPinButton() {
  const pin = $('activityPin');
  if (!pin) return;
  pin.hidden = !wideQuery().matches;
  setAttr(pin, 'aria-pressed', panel.pinned ? 'true' : 'false');
  const label = panel.pinned ? t('core.activity.unpin') : t('core.activity.pin');
  setAttr(pin, 'aria-label', label);
  setAttr(pin, 'title', label);
}

/** Apply the panel state to the DOM: body.panel-open / body.panel-pinned, inert when closed. */
function applyPanelState({ focus = false } = {}) {
  const p = $('activityPanel');
  const pinnedNow = panel.pinned && wideQuery().matches;
  if (pinnedNow) panel.open = true;
  document.body.classList.toggle('panel-open', panel.open);
  document.body.classList.toggle('panel-pinned', pinnedNow);
  if (p) {
    p.inert = !panel.open;
    p.dataset.state = panel.open ? 'open' : 'closed';
    p.classList.toggle('is-open', panel.open);
  }
  if (panel.open) { panel.unread = 0; }
  syncActivityToggle();
  syncPinButton();
  if (focus && panel.open && !pinnedNow) {
    const close = $('activityClose');
    if (close) requestAnimationFrame(() => close.focus({ preventScroll: true }));
  }
  bus.emit('panel:change', { open: panel.open, pinned: pinnedNow });
}

function setPanelOpen(open, { focus = true } = {}) {
  const wasOpen = panel.open;
  if (!open && panel.pinned && wideQuery().matches) {
    // Closing a pinned panel unpins it (the explicit close wins).
    panel.pinned = false;
    writeUiPrefs({ panelPinned: false });
  }
  panel.open = !!open;
  applyPanelState({ focus: focus && open });
  if (wasOpen && !panel.open) {
    const p = $('activityPanel');
    const toggle = $('activityToggle');
    if (p && toggle && (p.contains(document.activeElement) || document.activeElement === document.body)) toggle.focus({ preventScroll: true });
  }
}

function maybeCloseOverlayPanel() {
  if (panel.open && !(panel.pinned && wideQuery().matches)) setPanelOpen(false, { focus: false });
}

function setPinned(pinned) {
  panel.pinned = !!pinned;
  writeUiPrefs({ panelPinned: panel.pinned });
  if (panel.pinned) panel.open = true;
  applyPanelState();
}

function scrollFeedToTop() {
  const scroller = feedScroller();
  if (!scroller) return;
  try { scroller.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { scroller.scrollTop = 0; }
  const chip = $('activityNewChip');
  const chipHadFocus = chip && document.activeElement === chip;
  panel.unseen = 0;
  syncNewChip();
  if (!chipHadFocus) return;
  // The chip disappears: keep keyboard focus in the panel (newest clickable event, else the panel heading).
  const first = $('feedList') && $('feedList').querySelector('.feed-item');
  const title = $('activityTitle');
  if (first && first.tabIndex >= 0) first.focus({ preventScroll: true });
  else if (title) { if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); }
}

function buildActivityPanel() {
  const list = $('feedList');
  if (!list) return;
  panel.pinned = readUiPrefs().panelPinned === true;
  panel.open = panel.pinned && wideQuery().matches;
  localizeActivityPanel();
  renderFeedList();
  applyPanelState();
  if (panel.wired) return;
  panel.wired = true;

  on('feed:event', (ev) => { if (ev && typeof ev === 'object') insertFeedEvent(ev); });
  pausableInterval(refreshFeedTimes, 30000);

  const toggle = $('activityToggle');
  if (toggle) {
    const svg = toggle.querySelector('svg');
    if (svg && art && typeof art.icon === 'function') svg.replaceWith(iconFor('feed', 18));
    toggle.addEventListener('click', () => setPanelOpen(!panel.open));
  }
  const close = $('activityClose');
  if (close) close.addEventListener('click', () => setPanelOpen(false));
  const pin = $('activityPin');
  if (pin) pin.addEventListener('click', () => setPinned(!panel.pinned));
  const pause = $('activityPause');
  if (pause) pause.addEventListener('click', toggleFeedPaused);
  const chip = $('activityNewChip');
  if (chip) chip.addEventListener('click', scrollFeedToTop);
  const onPanelScroll = () => {
    const scroller = feedScroller();
    if (scroller && scroller.scrollTop <= 4 && panel.unseen) { panel.unseen = 0; syncNewChip(); }
  };
  list.addEventListener('scroll', onPanelScroll, { passive: true });
  const panelEl = $('activityPanel');
  if (panelEl) panelEl.addEventListener('scroll', onPanelScroll, { passive: true });
  const all = $('feedAll');
  if (all) all.addEventListener('click', openFeedArchive);

  // Overlay mode: outside pointer and Escape close the panel; leaving the wide layout un-pins it visually.
  document.addEventListener('pointerdown', (e) => {
    if (!panel.open || (panel.pinned && wideQuery().matches)) return;
    const p = $('activityPanel');
    const target = e.target;
    if (!(target instanceof Node) || (p && p.contains(target)) || (toggle && toggle.contains(target))) return;
    if (target instanceof Element && target.closest('.toast-stack, #modals, .cmdk, .menu')) return;
    setPanelOpen(false, { focus: false });
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !panel.open || (panel.pinned && wideQuery().matches)) return;
    if (document.body.classList.contains('has-modal') || document.body.classList.contains('has-drawer') || cmdk.open) return;
    setPanelOpen(false);
  });
  const wide = wideQuery();
  const onWide = () => {
    if (!wide.matches && panel.open && panel.pinned) panel.open = false;
    if (wide.matches && panel.pinned) panel.open = true;
    applyPanelState();
  };
  if (typeof wide.addEventListener === 'function') wide.addEventListener('change', onWide); else wide.addListener(onWide);
}

function openFeedArchive() {
  const items = ((store.state && store.state.feed) || []).slice(0, FEED_CAP);
  const list = h('ul', { class: 'feed-list is-archive', role: 'list' });
  if (!items.length) list.appendChild(h('li', {}, emptyState({ title: t('core.activity.emptyTitle') })));
  items.forEach((ev) => list.appendChild(feedItem(ev)));
  const d = drawer({
    title: t('core.activity.archiveTitle'), subtitle: tn('core.activity.archiveSub', items.length), body: list, size: 'lg',
    actions: [{ label: t('core.activity.exportJson'), variant: 'outline', closes: false, onClick: () => exportFeed(items) }, { label: t('core.common.close'), variant: 'ghost' }],
    onClose: pruneFeedTimes,
  });
  d.open();
}

function canExport() {
  if (sources && typeof sources.exportJSON === 'function') return true;
  toast(t('core.export.unavailable'), { tone: 'warning', timeout: 3500 });
  return false;
}

function exportFeed(items) {
  if (!canExport()) return;
  try { sources.exportJSON({ exportedAt: new Date().toISOString(), simulated: true, count: items.length, feed: items }, 'biltix-risk-ai-activity.json'); toast(t('core.activity.exported'), { tone: 'good' }); }
  catch (err) { reportError(err, 'exportFeed'); }
}

/* ------------------------------------------------------------------ */
/* Clock (Asia/Riyadh)                                                 */
/* ------------------------------------------------------------------ */

let timeFormatter = null;
let lastDateKey = '';

function rebuildClockFormatters() {
  const locale = `${i18n.locale()}-u-nu-${appliedNumerals === 'arab' ? 'arab' : 'latn'}`;
  try { timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: RIYADH_TZ }); }
  catch { timeFormatter = null; }
  lastDateKey = '';
}

function tickClock() {
  const now = new Date();
  const timeEl = $('clockTime');
  if (timeEl) {
    let text = '';
    if (timeFormatter) text = timeFormatter.format(now);
    else { try { text = fmt.time(now, { seconds: true }); } catch { text = ''; } }
    setText(timeEl, text);
    timeEl.setAttribute('datetime', now.toISOString());
  }
  // Day-granular parts refresh only when the Riyadh calendar day (or the language, numerals or calendar) changes.
  let dayKey = '';
  try { dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: RIYADH_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); } catch { dayKey = now.toDateString(); }
  if (dayKey !== lastDateKey) {
    lastDateKey = dayKey;
    renderClockDates(now);
  }
}

/**
 * App-bar date lines per settings.calendar (dates of the Riyadh day, fmt numerals):
 *   'gregorian' → "<weekday>, <Gregorian date>"      (Hijri line hidden)
 *   'hijri'     → "<weekday>، <Umm al-Qura date>"     (Gregorian line hidden)
 *   'both'      → "<weekday>, <Gregorian date>" + "<Umm al-Qura date>"
 */
function renderClockDates(now = new Date()) {
  const dateEl = $('clockDate');
  const hijriEl = $('clockHijri');
  const mode = appliedCalendar || calendarMode();
  const sep = isEn() ? ',' : '،';
  let day = '';
  try { day = fmt.dayName(now); } catch { day = ''; }
  const withDay = (text) => (day && text ? `${day}${sep} ${text}` : text);
  let greg = '';
  let hijri = '';
  if (mode !== 'hijri') { try { greg = fmt.date(now); } catch { greg = ''; } }
  if (mode !== 'gregorian') { try { hijri = fmt.hijri(now); } catch { hijri = ''; } }
  // fmt.hijri falls back to the Gregorian date on hosts without Umm al-Qura: never show the same date twice.
  if (mode === 'both' && hijri && hijri === greg) hijri = '';
  const showDate = mode !== 'hijri';
  const showHijri = mode === 'hijri' || Boolean(hijri);
  if (dateEl) { setText(dateEl, showDate ? withDay(greg) : ''); dateEl.hidden = !showDate; }
  if (hijriEl) { setText(hijriEl, mode === 'hijri' ? withDay(hijri) : hijri); hijriEl.hidden = !showHijri; }
  const clock = $('clock');
  if (clock) setAttr(clock, 'data-calendar', mode);
}

function startClock() {
  rebuildClockFormatters();
  tickClock();
  pausableInterval(tickClock, 1000); // paused while document.hidden, ticks immediately on return
}

/* ------------------------------------------------------------------ */
/* Data status chip + popover (CONTRACT §5)                             */
/* ------------------------------------------------------------------ */

const dataUi = { open: false, wired: false };

/** Primary status for the chip: the configured source; offline is shown as an extra marker. */
function dataStatusNow() {
  const src = status.source(store.state);
  return { ...src, online: status.online(), mode: status.mode(store.state) };
}

function connectorRecords() {
  return [...((store.state && store.state.integrations) || []), ...platformList('connectors')].filter(Boolean);
}

function connectorSummaryText() {
  const sum = status.summary(store.state, connectorRecords());
  if (!sum.total) return t('core.data.connectorsNone');
  const parts = status.STATUSES.filter((s) => sum.counts[s] > 0).map((s) => tn(`status.summary.${s}`, sum.counts[s]));
  return parts.join(' · ');
}

function chipLabel(st) {
  if (st.status === 'demo') return t('core.data.chipDemo');
  return status.label(st.status);
}

function syncDataChip() {
  const chip = $('dataChip');
  if (!chip) return;
  const st = dataStatusNow();
  const meta = status.meta(st.status);
  chip.dataset.status = st.status;
  chip.dataset.tone = meta.tone;
  chip.classList.toggle('is-offline', !st.online);
  const icon = $('dataChipIcon');
  if (icon && icon.dataset.icon !== `${meta.icon}`) { clear(icon); icon.appendChild(iconFor(meta.icon, 14, meta.tone)); icon.dataset.icon = meta.icon; }
  setText($('dataChipLabel'), chipLabel(st));
  const off = $('dataChipOffline');
  if (off) { off.hidden = st.online; setText(off, st.online ? '' : t('core.data.offlineSuffix')); }
  const spoken = `${chipLabel(st)}${st.online ? '' : ` · ${t('core.data.offlineSuffix')}`}`;
  setAttr(chip, 'aria-label', t('core.data.chipAria', { status: spoken }));
  setAttr(chip, 'title', status.desc(st.status));
  if (dataUi.open) renderDataPopover();
}

function renderDataPopover() {
  const pop = $('dataPopover');
  if (!pop) return;
  const st = dataStatusNow();
  clear(pop);
  const head = h('div', { class: 'data-popover-head' });
  head.appendChild(h('h2', { class: 'data-popover-title', id: 'dataPopoverTitle', tabindex: '-1' }, t('core.data.title')));
  let badgeNode = null;
  try { badgeNode = typeof components.statusBadge === 'function' ? components.statusBadge(st.status, { label: chipLabel(st) }) : null; } catch { badgeNode = null; }
  head.appendChild(badgeNode instanceof Node ? badgeNode : badge(chipLabel(st), status.meta(st.status).tone));
  pop.appendChild(head);
  const type = t(`core.data.types.${st.type}`);
  pop.appendChild(h('p', { class: 'data-popover-lead' }, st.mode === 'demo' ? t('core.data.demoLead') : t('core.data.liveLead', { type })));
  if (st.mode !== 'demo') pop.appendChild(h('p', { class: 'data-popover-desc' }, status.desc(st.status)));
  pop.appendChild(h('h3', { class: 'data-popover-sub' }, t('core.data.simulatedTitle')));
  const ul = h('ul', { class: 'data-popover-list' });
  ['feed', 'connectors', 'engine', 'writeback'].forEach((k) => ul.appendChild(h('li', {}, t(`core.data.simulated.${k}`))));
  pop.appendChild(ul);
  const dl = h('dl', { class: 'data-popover-facts' });
  const fact = (label, value) => { dl.appendChild(h('dt', {}, label)); dl.appendChild(h('dd', {}, value)); };
  fact(t('core.data.connectivity'), st.online ? t('core.data.online') : t('core.data.offline'));
  fact(t('core.data.connectorsLabel'), connectorSummaryText());
  const savedAt = store.state && store.state.meta && store.state.meta.savedAt;
  fact(t('core.data.storageLabel'), savedAt ? t('core.data.savedAt', { time: safeRelative(savedAt) }) : t('core.data.savedNever'));
  if (st.mode !== 'demo' && st.lastSuccessAt) fact(t('core.data.sourceLabel'), t('core.data.sourceLast', { time: safeRelative(st.lastSuccessAt) }));
  if (st.mode !== 'demo' && st.lastError) fact(t('core.data.errorLabel'), String(st.lastError));
  pop.appendChild(dl);
  const actions = h('div', { class: 'data-popover-actions' });
  if (viewById('settings')) actions.appendChild(button(t('core.data.openSettings'), { variant: 'outline', size: 'sm', onClick: () => { closeDataPopover(); router.navigate('settings', { section: 'data' }); } }));
  if (viewById('integrations')) actions.appendChild(button(t('core.data.openIntegrations'), { variant: 'ghost', size: 'sm', onClick: () => { closeDataPopover(); router.navigate('integrations'); } }));
  actions.appendChild(button(t('core.data.close'), { variant: 'ghost', size: 'sm', onClick: () => closeDataPopover({ restore: true }) }));
  pop.appendChild(actions);
}

function openDataPopover() {
  const pop = $('dataPopover');
  const chip = $('dataChip');
  if (!pop || !chip) return;
  dataUi.open = true;
  renderDataPopover();
  pop.hidden = false;
  chip.setAttribute('aria-expanded', 'true');
  document.body.classList.add('data-popover-open');
  requestAnimationFrame(() => { const title = $('dataPopoverTitle'); if (title) title.focus({ preventScroll: true }); });
}

function closeDataPopover({ restore = false } = {}) {
  const pop = $('dataPopover');
  const chip = $('dataChip');
  if (!pop || !dataUi.open) return;
  dataUi.open = false;
  const hadFocus = pop.contains(document.activeElement);
  pop.hidden = true;
  if (chip) chip.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('data-popover-open');
  if ((restore || hadFocus) && chip) chip.focus({ preventScroll: true });
}

function buildDataStatus() {
  syncDataChip();
  if (dataUi.wired) return;
  dataUi.wired = true;
  const chip = $('dataChip');
  const pop = $('dataPopover');
  if (chip) chip.addEventListener('click', () => (dataUi.open ? closeDataPopover({ restore: true }) : openDataPopover()));
  document.addEventListener('pointerdown', (e) => {
    if (!dataUi.open) return;
    const host = $('dataStatus');
    if (host && e.target instanceof Node && host.contains(e.target)) return;
    closeDataPopover();
  }, true);
  if (pop) {
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDataPopover({ restore: true }); } });
    pop.addEventListener('focusout', (e) => {
      const host = $('dataStatus');
      if (dataUi.open && e.relatedTarget instanceof Node && host && !host.contains(e.relatedTarget)) closeDataPopover();
    });
  }
  on('settings:change', syncDataChip);
  on('store:change', (p) => {
    const path = p && p.path ? String(p.path) : '*';
    if (path === '*' || path.startsWith('integrations') || path.startsWith('platform.connectors') || path === 'settings') syncDataChip();
  });
  on('integrations:tick', () => { if (dataUi.open) renderDataPopover(); });
  // navigator online / offline: chip, activity footer, one toast per transition.
  const onNetwork = () => {
    const online = status.online();
    syncDataChip();
    syncActivityFooter();
    toast(online ? t('core.data.onlineToast') : t('core.data.offlineToast'), { tone: online ? 'good' : 'warning', timeout: online ? 3000 : 6000 });
    bus.emit('status:change', { online, mode: status.mode(store.state) });
  };
  window.addEventListener('online', onNetwork);
  window.addEventListener('offline', onNetwork);
}

/* ------------------------------------------------------------------ */
/* Consolidated score pill (§B7) — #scorePill → cockpit                 */
/* ------------------------------------------------------------------ */

let scorePillFrame = 0;

function refreshScorePill() {
  const pill = $('scorePill');
  if (!pill) return;
  const hasData = typeof store.hasPlatformData === 'function' ? store.hasPlatformData() : platformList('aiRisks').length > 0;
  if (!psel || typeof psel.consolidatedScore !== 'function' || !hasData) { pill.hidden = true; return; }
  let data = null;
  try { data = psel.consolidatedScore(store.state, filters()); } catch (err) { reportError(err, 'psel.consolidatedScore'); pill.hidden = true; return; }
  const score = data && Number.isFinite(Number(data.score)) ? Math.round(Number(data.score)) : null;
  if (score === null) { pill.hidden = true; return; }
  const rating = RATINGS.includes(data.rating) ? data.rating : ratingOf(score);
  const label = ratingLabel(rating);
  pill.hidden = false;
  pill.dataset.rating = rating;
  setText($('scoreValue'), fmt.num(score));
  setText($('scoreLabel'), t('core.score.labelRated', { rating: label }));
  const deltaEl = $('scoreDelta');
  const delta = data && Number.isFinite(Number(data.delta)) ? Number(data.delta) : 0;
  if (deltaEl) {
    const show = delta !== 0;
    deltaEl.hidden = !show;
    setText(deltaEl, show ? fmt.signed(delta) : '');
    deltaEl.classList.toggle('is-up', delta > 0);
    deltaEl.classList.toggle('is-down', delta < 0);
  }
  const deltaText = delta !== 0 ? t('core.score.delta', { delta: fmt.signed(delta) }) : '';
  setAttr(pill, 'aria-label', t('core.score.aria', { score: fmt.num(score), rating: label, delta: deltaText }));
  setAttr(pill, 'title', t('core.score.title', { score: fmt.num(score), rating: label, delta: deltaText }));
}

function scheduleScorePill() {
  if (scorePillFrame) return;
  scorePillFrame = requestAnimationFrame(() => { scorePillFrame = 0; refreshScorePill(); });
}

function buildScorePill() {
  const pill = $('scorePill');
  if (!pill) return;
  pill.addEventListener('click', () => router.navigate(viewById('cockpit') ? 'cockpit' : FALLBACK_VIEW));
  refreshScorePill();
  on('store:change', (p) => {
    const path = p && p.path ? String(p.path) : '*';
    if (path === '*' || path.startsWith('platform') || path === 'settings') scheduleScorePill();
  });
  on('filters:change', scheduleScorePill);
  on('settings:change', scheduleScorePill);
}

/* ------------------------------------------------------------------ */
/* Notifications: alerts list, bell, banner                            */
/* ------------------------------------------------------------------ */

const alerts = [];
let unreadAlerts = 0;
let bellDrawer = null;
let bannerTimer = null;
let bannerAlert = null;

function alertTone(payload) {
  if (!payload) return 'warning';
  if (TONES.includes(payload.tone)) return payload.tone;
  const sev = payload.severity;
  if (typeof sev === 'string') return TONES.includes(sev) ? sev : (sev === 'high' ? 'serious' : 'warning');
  if (typeof sev === 'number') return sev >= 4 ? 'critical' : sev === 3 ? 'serious' : 'warning';
  return 'warning';
}

/** Alerts raised by the live engines are simulated unless they carry real evidence. */
const isSimulatedAlert = (a) => a.simulated !== false && status.mode(store.state) === 'demo';

function alertTitle(a) { return eventText(a, 'title') || t('core.alerts.fallbackTitle'); }
function alertDetail(a) { return eventText(a, 'detail'); }

function updateBell() {
  const count = $('bellCount');
  const bell = $('bellBtn');
  if (count) {
    setText(count, fmt.num(Math.min(unreadAlerts, 99)));
    count.hidden = unreadAlerts === 0;
  }
  if (bell) {
    bell.classList.toggle('has-unread', unreadAlerts > 0);
    setAttr(bell, 'aria-label', unreadAlerts > 0 ? tn('core.alerts.bellUnread', unreadAlerts) : t('core.alerts.bell'));
    setAttr(bell, 'title', t('core.alerts.bell'));
  }
}

function alertRow(a) {
  const li = h('li', { class: ['alert-item', `tone-${a.tone}`] });
  li.appendChild(badge(t(`core.alerts.tones.${a.tone}`), a.tone));
  const body = h('div', { class: 'alert-item-body' });
  body.appendChild(h('strong', { class: 'alert-item-title' }, richText(alertTitle(a))));
  const detail = alertDetail(a);
  if (detail) body.appendChild(h('p', { class: 'alert-item-detail' }, richText(detail)));
  const meta = h('div', { class: 'alert-item-meta' });
  const site = siteById(a.siteId);
  if (site) meta.appendChild(h('span', {}, siteName(site)));
  if (isSimulatedAlert(a)) meta.appendChild(h('span', { class: 'alert-item-sim' }, t('core.alerts.simulated')));
  meta.appendChild(h('time', { class: 'mono', datetime: a.ts }, safeRelative(a.ts)));
  body.appendChild(meta);
  li.appendChild(body);
  return li;
}

function openBellDrawer() {
  if (bellDrawer && bellDrawer.isOpen()) { bellDrawer.close(); return; }
  unreadAlerts = 0; updateBell();
  const list = h('ul', { class: 'alert-list', role: 'list' });
  if (!alerts.length) list.appendChild(h('li', {}, emptyState({ icon: glyph('good', 30), title: t('core.alerts.emptyTitle'), text: t('core.alerts.emptyText') })));
  alerts.forEach((a) => list.appendChild(alertRow(a)));
  bellDrawer = drawer({
    title: t('core.alerts.title'), subtitle: tn('core.alerts.sub', alerts.length), body: list,
    actions: [
      { label: t('core.alerts.clearAll'), variant: 'outline', onClick: () => { alerts.length = 0; unreadAlerts = 0; updateBell(); toast(t('core.alerts.cleared'), { tone: 'neutral' }); } },
      { label: t('core.alerts.close'), variant: 'ghost' },
    ],
  });
  bellDrawer.open();
}

function showBanner(a) {
  const banner = $('alertBanner');
  if (!banner) return;
  bannerAlert = a;
  clear(banner);
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  TONES.forEach((tone) => banner.classList.remove(`tone-${tone}`));
  banner.classList.add(`tone-${a.tone}`);
  banner.appendChild(h('span', { class: 'alert-banner-icon', 'aria-hidden': 'true' }, glyph(a.tone, 20)));
  const text = h('div', { class: 'alert-banner-text' });
  const title = h('strong', { class: 'alert-banner-title' }, richText(eventText(a, 'title') || t('core.alerts.bannerFallback')));
  text.appendChild(title);
  const detailParts = [];
  const detail = alertDetail(a);
  if (detail) detailParts.push(detail);
  const site = siteById(a.siteId);
  if (site) detailParts.push(siteName(site));
  if (detailParts.length) text.appendChild(h('span', { class: 'alert-banner-detail' }, richText(detailParts.join(' — '))));
  banner.appendChild(text);
  if (isSimulatedAlert(a)) banner.appendChild(badge(t('core.alerts.simulated'), 'accent', { icon: 'flask' }));
  const actions = h('div', { class: 'alert-banner-actions' });
  if (a.riskId && viewById('airisks')) {
    actions.appendChild(button(t('core.alerts.openRisk'), { variant: 'outline', size: 'sm', onClick: () => { hideBanner(); router.navigate('airisks', { risk: a.riskId }); } }));
  } else if (viewById('radar')) {
    actions.appendChild(button(t('core.alerts.openRadar'), { variant: 'outline', size: 'sm', onClick: () => { hideBanner(); router.navigate('radar', a.siteId ? { site: a.siteId } : {}); } }));
  }
  actions.appendChild(button('', { variant: 'ghost', size: 'sm', icon: glyph('close', 16), onClick: hideBanner, attrs: { 'aria-label': t('core.alerts.dismiss') } }));
  banner.appendChild(actions);
  banner.hidden = false;
  document.body.classList.add('has-banner');
  requestAnimationFrame(() => banner.classList.add('is-open'));
  bannerTimer = setTimeout(hideBanner, BANNER_MS);
}

function hideBanner() {
  const banner = $('alertBanner');
  if (!banner) return;
  bannerAlert = null;
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  banner.classList.remove('is-open');
  const done = () => { if (bannerAlert) return; banner.hidden = true; document.body.classList.remove('has-banner'); clear(banner); };
  if (reducedMotion()) done(); else setTimeout(done, 240);
}

/* Single assertive live region (#liveAnnouncer): critical / serious alerts are announced once each. */
const announcedAlerts = new Set();
let announceTimer = null;
function announceAlert(a) {
  const el = $('liveAnnouncer');
  if (!el || (a.tone !== 'critical' && a.tone !== 'serious')) return;
  const key = a.alertId || a.id || `${a.ts}|${a.title}`;
  if (announcedAlerts.has(key)) return;
  announcedAlerts.add(key);
  if (announcedAlerts.size > 500) announcedAlerts.clear();
  const site = siteById(a.siteId);
  const head = a.tone === 'critical' ? t('core.alerts.announceCritical') : t('core.alerts.announceSerious');
  const lead = isSimulatedAlert(a) ? `${head} (${t('core.alerts.announceSimulated')})` : head;
  const text = [lead, plainCodes(alertTitle(a)), plainCodes(alertDetail(a)), siteName(site)].filter(Boolean).join(isEn() ? ', ' : '، ');
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = text; });
  if (announceTimer) clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = ''; }, 8000);
}

function buildNotifications() {
  const bell = $('bellBtn');
  if (bell) bell.addEventListener('click', openBellDrawer);
  updateBell();
  on('alert', (payload) => {
    const a = { ...(payload || {}), tone: alertTone(payload), ts: (payload && payload.ts) || new Date().toISOString() };
    alerts.unshift(a);
    if (alerts.length > ALERT_CAP) alerts.length = ALERT_CAP;
    unreadAlerts = Math.min(unreadAlerts + 1, 99);
    updateBell();
    const site = siteById(a.siteId);
    const parts = [alertDetail(a), siteName(site)].filter(Boolean);
    let msg = parts.join(' — ');
    if (isSimulatedAlert(a)) msg = msg ? `${msg} · ${t('core.alerts.simulatedNote')}` : t('core.alerts.simulatedNote');
    const title = plainCodes(alertTitle(a));
    const shown = toast(msg || title || t('core.alerts.fallbackNew'), { tone: a.tone, title: msg ? title : '', timeout: a.tone === 'critical' ? 9000 : 5500, action: { label: t('core.alerts.view'), onClick: openBellDrawer } });
    // Critical / serious alerts are spoken once, by #liveAnnouncer: their toast (role=alert) stays
    // visible but is taken out of the live-region machinery so screen readers do not repeat it.
    if (shown && shown.el && (a.tone === 'critical' || a.tone === 'serious')) shown.el.removeAttribute('role');
    if (a.tone === 'critical') showBanner(a);
    announceAlert(a);
  });
}

/** Close every transient surface before the view changes (bell drawer, "More" sheet, palette, menus, popover). */
function closeTransientUi() {
  if (bellDrawer && bellDrawer.isOpen()) bellDrawer.close();
  if (moreDrawer && moreDrawer.isOpen()) moreDrawer.close();
  if (cmdk.open) closeCmdk();
  if (dataUi.open) closeDataPopover();
  document.querySelectorAll('.menu.is-open').forEach((menu) => { try { if (typeof menu.__close === 'function') menu.__close(); else menu.remove(); } catch { /* ignore */ } });
}

/* ------------------------------------------------------------------ */
/* Language switch "ع | EN"                                             */
/* ------------------------------------------------------------------ */

let langBusy = false;

async function switchLang(lang) {
  if (lang === i18n.lang() || langBusy) return;
  langBusy = true;
  document.documentElement.setAttribute('aria-busy', 'true');
  try {
    await i18n.setLang(lang);
  } catch (err) {
    reportError(err, 'i18n.setLang');
  } finally {
    langBusy = false;
    document.documentElement.removeAttribute('aria-busy');
  }
}

/** One "ع | EN" segmented control (app bar instance is static markup; the sheet builds its own). */
function langSwitchControl({ onSwitch = null } = {}) {
  const wrap = h('div', { class: 'lang-switch', role: 'group', 'aria-label': t('core.lang.groupAria') });
  ['ar', 'en'].forEach((code) => {
    const b = h('button', {
      type: 'button', class: 'lang-opt', 'data-lang': code, lang: code, 'aria-label': code === 'ar' ? 'العربية' : 'English',
      'aria-pressed': i18n.lang() === code ? 'true' : 'false',
      onClick: () => { if (typeof onSwitch === 'function') onSwitch(); switchLang(code); },
      onPointerenter: () => { if (code === 'en') i18n.loadData().catch(() => {}); },
      onFocus: () => { if (code === 'en') i18n.loadData().catch(() => {}); },
    }, code === 'ar' ? 'ع' : 'EN');
    wrap.appendChild(b);
  });
  return wrap;
}

function syncLangSwitch() {
  const wrap = $('langSwitch');
  if (!wrap) return;
  setAttr(wrap, 'aria-label', t('core.lang.groupAria'));
  wrap.querySelectorAll('.lang-opt').forEach((b) => {
    const active = b.dataset.lang === i18n.lang();
    setAttr(b, 'aria-pressed', active ? 'true' : 'false');
    b.classList.toggle('is-active', active);
    const target = b.dataset.lang === 'ar' ? 'العربية' : 'English';
    setAttr(b, 'title', active ? target : t('core.lang.switchTo', { lang: target }));
  });
}

function buildLangSwitch() {
  const wrap = $('langSwitch');
  if (!wrap) return;
  syncLangSwitch();
  wrap.querySelectorAll('.lang-opt').forEach((b) => {
    b.addEventListener('click', () => switchLang(b.dataset.lang));
    // Warm the English data dictionaries before the click (Arabic sessions never download them otherwise).
    if (b.dataset.lang === 'en') {
      const warm = () => { i18n.loadData().catch(() => {}); };
      b.addEventListener('pointerenter', warm);
      b.addEventListener('focus', warm);
    }
  });
}

/** Re-render every piece of shell chrome in the active language (boot, lang:change, numerals change). */
function renderShellChrome() {
  localizeStaticChrome();
  applyBrandText({ ...DEFAULT_BRAND, ...(settings().brand || {}) });
  buildRail();
  buildTabbar();
  localizeFilters();
  localizeActivityPanel();
  renderFeedList();
  rebuildClockFormatters();
  tickClock();
  syncDataChip();
  refreshScorePill();
  updateBell();
  if (bannerAlert) showBanner(bannerAlert);
  if (cmdk.open) { cmdk.items = staticCommands(); runSearch(cmdk.input ? cmdk.input.value : ''); }
  const cur = router.current ? router.current() : null;
  if (cur && cur.id) markActive(cur.id);
}

function onLangChange() {
  // Transient surfaces were built in the previous language: close them; drop stale toasts.
  if (bellDrawer && bellDrawer.isOpen()) bellDrawer.close();
  if (moreDrawer && moreDrawer.isOpen()) moreDrawer.close();
  if (dataUi.open) closeDataPopover();
  document.querySelectorAll('#toasts .toast').forEach((el) => el.remove());
  renderShellChrome();
  toast(t('core.lang.changed'), { tone: 'neutral', timeout: 2400 });
}

/* ------------------------------------------------------------------ */
/* Theme & rail toggles                                                */
/* ------------------------------------------------------------------ */

function toggleTheme() {
  const next = settings().theme === 'light' ? 'dark' : 'light';
  store.setSettings({ theme: next });
  toast(next === 'light' ? t('core.shell.themeLight') : t('core.shell.themeDark'), { tone: 'neutral', timeout: 2200 });
}

function toggleFeedPaused() {
  const paused = !settings().feedPaused;
  store.setSettings({ feedPaused: paused });
  toast(paused ? t('core.activity.paused') : t('core.activity.resumed'), { tone: paused ? 'warning' : 'good', timeout: 2600 });
}

const narrowQuery = () => window.matchMedia('(max-width: 959px)');

function toggleRail() {
  if (narrowQuery().matches) {
    const open = !document.body.classList.contains('rail-open');
    setRailOpen(open);
    return;
  }
  store.setSettings({ railCollapsed: !settings().railCollapsed });
}

function setRailOpen(open) {
  document.body.classList.toggle('rail-open', open);
  const rail = $('rail');
  if (rail) rail.classList.toggle('is-open', open);
  syncRailToggle();
}

function buildToggles() {
  const themeBtn = $('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  const railToggle = $('railToggle');
  if (railToggle) railToggle.addEventListener('click', toggleRail);
  const userChip = $('userChip');
  if (userChip) userChip.addEventListener('click', () => router.navigate('settings'));

  // Layout mode transitions: close overlays that only exist in narrower layouts.
  const narrow = narrowQuery();
  const onNarrow = () => { if (!narrow.matches) setRailOpen(false); syncRailToggle(); syncRailTooltips(); };
  if (typeof narrow.addEventListener === 'function') narrow.addEventListener('change', onNarrow); else narrow.addListener(onNarrow);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('rail-open')) setRailOpen(false);
  });
}

/* ------------------------------------------------------------------ */
/* Command palette (Ctrl/Cmd+K)                                        */
/* ------------------------------------------------------------------ */

const cmdk = { open: false, items: [], results: [], active: 0, previous: null, el: null, input: null, list: null, btn: null };

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyScore(query, text) {
  if (!query) return 1;
  const q = normalizeText(query); const tx = normalizeText(text);
  if (!q || !tx) return 0;
  if (tx === q) return 120;
  if (tx.startsWith(q)) return 100;
  const idx = tx.indexOf(q);
  if (idx >= 0) return 80 - Math.min(idx, 30) * 0.5;
  if (tx.split(' ').some((w) => w.startsWith(q))) return 70;
  // subsequence match with gap penalty
  let ti = 0; let gaps = 0; let matched = 0;
  for (const ch of q) {
    const found = tx.indexOf(ch, ti);
    if (found < 0) return 0;
    gaps += found - ti; ti = found + 1; matched += 1;
  }
  return matched >= 2 ? Math.max(5, 40 - gaps) : 0;
}

function bestScore(query, fields) {
  let best = 0;
  fields.forEach((f, i) => { const s = fuzzyScore(query, f); if (s > best) best = s - i * 2; });
  return best;
}

function staticCommands() {
  const viewItems = views.map((v) => {
    const meta = navMeta(v);
    const group = navGroups.find((x) => x.viewIds.includes(v.id));
    return {
      id: `view:${v.id}`, group: group ? group.label : t('core.cmdk.groups.views'), label: meta.title, meta: meta.code, icon: v.icon,
      // Both languages are searchable whichever is active.
      keywords: [meta.title, meta.shortTitle, coreDict.ar.nav[v.id] ? coreDict.ar.nav[v.id].title : '', coreDict.en.nav[v.id] ? coreDict.en.nav[v.id].title : '', v.title || '', meta.code, v.id],
      run: () => router.navigate(v.id),
    };
  });
  const has = (id) => Boolean(viewById(id));
  const A = (key) => t(`core.cmdk.actions.${key}`);
  const M = (key) => t(`core.cmdk.metas.${key}`);
  const kw = (key) => [coreDict.ar.cmdk.actions[key], coreDict.en.cmdk.actions[key]];
  const actionItems = [
    has('airisks') ? { id: 'act:red-risks', label: A('redRisks'), meta: navMeta('airisks').title, icon: 'shield-alert', keywords: [...kw('redRisks'), 'red'], run: () => router.navigate('airisks', { rating: 'red' }) } : null,
    has('tasks') ? { id: 'act:new-task', label: A('newTask'), meta: navMeta('tasks').title, icon: 'file-check', keywords: [...kw('newTask'), 'new task'], run: () => router.navigate('tasks', { new: 1 }) } : null,
    has('alerts') ? { id: 'act:alerts', label: A('escalation'), meta: navMeta('alerts').title, icon: 'bell', keywords: [...kw('escalation'), 'escalation'], run: () => router.navigate('alerts', { queue: 'immediate' }) } : null,
    has('risks') ? { id: 'act:new-risk', label: A('newRisk'), meta: navMeta('risks').title, icon: 'risk', keywords: [...kw('newRisk'), 'add risk'], run: () => router.navigate('risks', { new: 1 }) } : null,
    has('incidents') ? { id: 'act:new-incident', label: A('newIncident'), meta: navMeta('incidents').title, icon: 'incident', keywords: [...kw('newIncident'), 'report incident'], run: () => router.navigate('incidents', { new: 1 }) } : null,
    { id: 'act:lang', label: A('lang'), meta: M('language'), icon: 'globe', keywords: [...kw('lang'), 'language', 'english', 'arabic', 'لغة', 'عربي', 'انجليزي'], run: () => switchLang(i18n.other()) },
    { id: 'act:theme', label: A('theme'), meta: M('appearance'), icon: 'theme', keywords: [...kw('theme'), 'theme dark light'], run: toggleTheme },
    { id: 'act:feed', label: () => (settings().feedPaused ? A('resumeFeed') : A('pauseFeed')), meta: M('activity'), icon: 'feed', keywords: [...kw('pauseFeed'), ...kw('resumeFeed'), 'pause feed activity'], run: toggleFeedPaused },
    { id: 'act:data', label: A('dataStatus'), meta: M('data'), icon: 'info', keywords: [...kw('dataStatus'), 'demo local data status'], run: openDataPopover },
    { id: 'act:export', label: A('export'), meta: M('reports'), icon: 'export', keywords: [...kw('export'), 'json export'], run: exportState },
    has('reports') ? { id: 'act:print', label: A('print'), meta: M('reports'), icon: 'print', keywords: [...kw('print'), 'pdf print'], run: printReport } : null,
  ].filter(Boolean).map((a) => ({ ...a, group: t('core.cmdk.groups.actions') }));
  return [...viewItems, ...actionItems];
}

function exportState() {
  if (!canExport()) return;
  try {
    sources.exportJSON(store.state, `biltix-risk-ai-${new Date().toISOString().slice(0, 10)}.json`);
    toast(t('core.export.stateDone'), { tone: 'good' });
  } catch (err) { reportError(err, 'exportJSON'); }
}

function printReport() {
  const cur = router.current ? router.current() : { id: null };
  if (cur.id !== 'reports') router.navigate('reports');
  setTimeout(() => { try { window.print(); } catch (err) { reportError(err, 'print'); } }, cur.id === 'reports' ? 50 : 700);
}

function enumText(ns, value) {
  if (value === undefined || value === null || value === '') return '';
  return i18n.label(ns, value);
}

function dynamicCommands(query) {
  if (!query || normalizeText(query).length < 2) return [];
  const state = store.state || {};
  const out = [];
  // Part B (§B7): AI risks, contracts and mitigation tasks by code / title (Arabic and English text both match).
  if (viewById('airisks')) {
    platformList('aiRisks').forEach((r) => {
      const site = siteById(r.projectId);
      const title = dataText(r, 'title', 'aiRisks');
      const score = bestScore(query, [r.code, title, r.title, siteName(site)]);
      if (score > 0) {
        const rating = ratingOf(r.score);
        out.push({ id: `air:${r.id}`, group: t('core.cmdk.groups.aiRisks'), label: title, meta: r.code, badge: { text: `${ratingLabel(rating)} · ${fmt.num(Math.round(Number(r.score) || 0))}`, tone: ratingTone(rating) }, icon: 'shield-alert', score,
          run: () => router.navigate('airisks', { risk: r.id }) });
      }
    });
  }
  if (viewById('contracts')) {
    platformList('contracts').forEach((c) => {
      const site = siteById(c.projectId);
      const title = dataText(c, 'title', 'contracts');
      const party = dataText(c, 'counterparty', 'contracts');
      const score = bestScore(query, [c.code, title, c.title, party, siteName(site)]);
      if (score > 0) {
        const rating = ratingOf(c.riskScore);
        out.push({ id: `ct:${c.id}`, group: t('core.cmdk.groups.contracts'), label: `${title}${party ? ` — ${party}` : ''}`, meta: c.code, badge: { text: c.status ? enumText('contractStatus', c.status) : ratingLabel(rating), tone: ratingTone(rating) }, icon: 'file-text', score,
          run: () => router.navigate('contracts', { id: c.id }) });
      }
    });
  }
  if (viewById('tasks')) {
    platformList('tasks').forEach((tk) => {
      const site = siteById(tk.projectId);
      const title = dataText(tk, 'title', 'tasks');
      const score = bestScore(query, [tk.code, title, tk.title, i18n.term(tk.owner || ''), siteName(site)]);
      if (score > 0) {
        const tone = tk.status === 'مغلقة' ? 'good' : tk.status === 'متأخرة' ? 'critical' : tk.status === 'قيد التنفيذ' ? 'accent' : 'neutral';
        out.push({ id: `mt:${tk.id}`, group: t('core.cmdk.groups.tasks'), label: title, meta: tk.code, badge: { text: enumText('taskStatus', tk.status), tone }, icon: 'file-check', score,
          run: () => router.navigate('tasks', { id: tk.id }) });
      }
    });
  }
  (state.risks || []).forEach((r) => {
    const site = siteById(r.siteId);
    const hazard = dataText(r, 'hazard', 'risks');
    const activity = dataText(r, 'activity', 'risks');
    const score = bestScore(query, [r.code, hazard, r.hazard, activity, siteName(site)]);
    if (score > 0) {
      let tier = ''; let tone = 'neutral';
      try { tier = sel.riskTier(sel.riskScore(r)); tone = sel.tierTone(tier); } catch { tier = ''; }
      out.push({ id: `risk:${r.id}`, group: t('core.cmdk.groups.risks'), label: hazard, meta: r.code, badge: tier ? { text: enumText('tier', tier), tone } : null, icon: 'risk', score,
        run: () => { store.setFilter('search', r.code); router.navigate('risks', { q: r.code, id: r.id }); } });
    }
  });
  (state.permits || []).forEach((p) => {
    const site = siteById(p.siteId);
    const type = enumText('permitType', p.type);
    const location = dataText(p, 'location', 'permits');
    const score = bestScore(query, [p.code, type, p.type, location, siteName(site)]);
    if (score > 0) {
      const tone = p.status === 'نشط' ? 'good' : p.status === 'معلق' ? 'warning' : p.status === 'بانتظار الاعتماد' ? 'accent' : 'neutral';
      out.push({ id: `permit:${p.id}`, group: t('core.cmdk.groups.permits'), label: `${type}${location ? ` — ${location}` : ''}`, meta: p.code, badge: { text: enumText('permitStatus', p.status), tone }, icon: 'permit', score,
        run: () => { store.setFilter('search', p.code); router.navigate('permits', { q: p.code, id: p.id }); } });
    }
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 14);
}

function labelOf(item) { return typeof item.label === 'function' ? item.label() : item.label; }

function runSearch(query) {
  const q = query.trim();
  const statics = cmdk.items.map((it) => ({ ...it, score: q ? bestScore(q, [labelOf(it), it.meta || '', ...(it.keywords || [])]) : 1 })).filter((it) => it.score > 0);
  statics.sort((a, b) => b.score - a.score);
  const dyn = dynamicCommands(q);
  cmdk.results = [...statics.slice(0, q ? 8 : statics.length), ...dyn];
  cmdk.active = 0;
  renderCmdk();
}

function renderCmdk() {
  const list = cmdk.list;
  if (!list) return;
  clear(list);
  if (!cmdk.results.length) {
    list.appendChild(h('li', { class: 'cmdk-empty', role: 'option', 'aria-selected': 'false', id: 'cmdk-empty' }, emptyState({ icon: glyph('empty', 26), title: t('core.cmdk.emptyTitle'), text: t('core.cmdk.emptyText') })));
    cmdk.input.setAttribute('aria-activedescendant', '');
    return;
  }
  let lastGroup = null;
  cmdk.results.forEach((item, i) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      list.appendChild(h('li', { class: 'cmdk-group', role: 'presentation' }, item.group));
    }
    const id = `cmdk-opt-${i}`;
    const li = h('li', { class: ['cmdk-item', i === cmdk.active ? 'is-active' : null], role: 'option', id, 'aria-selected': i === cmdk.active ? 'true' : 'false', 'data-index': String(i),
      onClick: () => runCommand(i), onPointermove: () => setActive(i, false) });
    li.appendChild(h('span', { class: 'cmdk-icon', 'aria-hidden': 'true' }, iconFor(item.icon, 16)));
    const text = h('span', { class: 'cmdk-text' });
    text.appendChild(h('span', { class: 'cmdk-label' }, labelOf(item)));
    if (item.badge && item.badge.text) text.appendChild(badge(item.badge.text, item.badge.tone));
    li.appendChild(text);
    if (item.meta) li.appendChild(h('span', { class: 'cmdk-meta mono' }, String(item.meta)));
    list.appendChild(li);
  });
  cmdk.input.setAttribute('aria-activedescendant', `cmdk-opt-${cmdk.active}`);
}

function setActive(i, scroll = true) {
  if (!cmdk.results.length) return;
  cmdk.active = (i + cmdk.results.length) % cmdk.results.length;
  cmdk.list.querySelectorAll('.cmdk-item').forEach((li) => {
    const isOn = Number(li.dataset.index) === cmdk.active;
    li.classList.toggle('is-active', isOn);
    li.setAttribute('aria-selected', isOn ? 'true' : 'false');
    if (isOn && scroll) li.scrollIntoView({ block: 'nearest' });
  });
  cmdk.input.setAttribute('aria-activedescendant', `cmdk-opt-${cmdk.active}`);
}

function runCommand(i) {
  const item = cmdk.results[i];
  if (!item) return;
  closeCmdk();
  try { item.run(); } catch (err) { reportError(err, 'command'); }
}

function openCmdk() {
  if (!cmdk.el || cmdk.open) return;
  cmdk.open = true;
  cmdk.previous = document.activeElement;
  cmdk.items = staticCommands();
  cmdk.el.hidden = false;
  document.body.classList.add('cmdk-open');
  if (cmdk.btn) cmdk.btn.setAttribute('aria-expanded', 'true');
  cmdk.input.value = '';
  runSearch('');
  requestAnimationFrame(() => { cmdk.el.classList.add('is-open'); cmdk.input.focus(); });
}

function closeCmdk() {
  if (!cmdk.el || !cmdk.open) return;
  cmdk.open = false;
  cmdk.el.classList.remove('is-open');
  document.body.classList.remove('cmdk-open');
  if (cmdk.btn) cmdk.btn.setAttribute('aria-expanded', 'false');
  const done = () => { if (!cmdk.open) cmdk.el.hidden = true; };
  if (reducedMotion()) done(); else setTimeout(done, 180);
  // Hand focus back to the opener; when there was none (focus was on <body>) fall back to the search button.
  const prev = cmdk.previous;
  const usable = prev && prev !== document.body && prev !== document.documentElement && typeof prev.focus === 'function' && document.contains(prev);
  const target = usable ? prev : cmdk.btn;
  if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
}

function buildCommandPalette() {
  cmdk.el = $('cmdk'); cmdk.input = $('cmdkInput'); cmdk.list = $('cmdkList'); cmdk.btn = $('cmdkBtn');
  if (!cmdk.el || !cmdk.input || !cmdk.list) return;
  if (cmdk.btn) cmdk.btn.addEventListener('click', () => (cmdk.open ? closeCmdk() : openCmdk()));
  cmdk.el.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.hasAttribute('data-cmdk-close')) closeCmdk(); });
  const onInput = debounce(() => runSearch(cmdk.input.value), 60);
  cmdk.input.addEventListener('input', onInput);
  cmdk.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(cmdk.active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(cmdk.active - 1); }
    else if (e.key === 'Home' && cmdk.results.length) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && cmdk.results.length) { e.preventDefault(); setActive(cmdk.results.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); onInput.cancel(); runCommand(cmdk.active); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  });
  document.addEventListener('keydown', (e) => {
    const isK = e.key === 'k' || e.key === 'K' || e.code === 'KeyK';
    if ((e.ctrlKey || e.metaKey) && isK && !e.altKey) { e.preventDefault(); if (cmdk.open) closeCmdk(); else openCmdk(); return; }
    if (e.key === 'Escape' && cmdk.open) { e.preventDefault(); closeCmdk(); }
  });
}

/* ------------------------------------------------------------------ */
/* Router wiring & boot                                                */
/* ------------------------------------------------------------------ */

/** ctx handed to every view render (ARCHITECTURE §4 + CONTRACT §4: i18n, t, tn, L, status, motion). */
function buildContext() {
  return { store, bus, sel, fmt, charts, radar, components, art, live, sources, router, psel, platformLive, i18n, t, tn, L, status, motion };
}

let lastNumerals = null;
let lastMode = null;

function handleSettingsChange(payload) {
  const s = (payload && payload.settings) || settings();
  applySettings(s);
  // settings.lang written directly (e.g. by the settings view) → apply through i18n (persisted, emits lang:change).
  if ((s.lang === 'ar' || s.lang === 'en') && s.lang !== i18n.lang()) switchLang(s.lang);
  const numerals = s.numerals === 'arab' ? 'arab' : 'latn';
  if (lastNumerals !== null && numerals !== lastNumerals) {
    renderShellChrome();
    router.refresh({ preserveScroll: true });
  }
  lastNumerals = numerals;
  const mode = status.mode(store.state);
  if (lastMode !== null && mode !== lastMode) bus.emit('status:change', { online: status.online(), mode });
  lastMode = mode;
  syncActivityFooter();
}

/** Home route: cockpit, else the HSE overview, else whatever loaded first (§B7). */
function homeViewId() {
  if (viewById(DEFAULT_VIEW)) return DEFAULT_VIEW;
  if (viewById(FALLBACK_VIEW)) return FALLBACK_VIEW;
  return views[0] ? views[0].id : DEFAULT_VIEW;
}

function renderShellEmpty(main) {
  if (!main) return;
  clear(main);
  main.appendChild(h('section', { class: 'view shell-empty', 'aria-live': 'polite' }, emptyState({
    icon: glyph('accent', 32),
    title: t('core.shellEmpty.title'),
    text: t('core.shellEmpty.text'),
  })));
}

// First chrome pass as soon as this module evaluates (before the optional modules load), so an
// English session never shows the Arabic placeholders of index.html for long.
try { localizeStaticChrome(); } catch { /* DOM not ready: boot() localises again */ }

async function boot() {
  const main = $('main');
  document.body.classList.add('is-booting');
  trackInputModality();
  installVisibilityManager();

  // Views are NOT imported here: the static registry drives the rail / tab bar / palette and the
  // router imports each module on first navigation (hover / focus prefetch warms it up). English
  // data dictionaries load only for English sessions (in parallel with the optional modules).
  await Promise.all([
    loadOptionalModules(),
    i18n.lang() === 'en' ? i18n.loadData().catch(() => false) : null,
  ]);
  views = navViews.filter((v) => v && typeof v.id === 'string' && (typeof v.load === 'function' || typeof v.render === 'function'));

  applySettings();
  lastNumerals = settings().numerals === 'arab' ? 'arab' : 'latn';
  lastMode = status.mode(store.state);
  mountBackdrop();
  localizeStaticChrome();
  buildRail();
  buildTabbar();
  buildFilters();
  buildActivityPanel();
  startClock();
  buildDataStatus();
  buildScorePill();
  buildNotifications();
  buildLangSwitch();
  buildToggles();
  buildCommandPalette();

  views.forEach((view) => { try { router.register(view); } catch (err) { reportError(err, `router.register(${view && view.id})`); } });
  router.setContainer(main);
  router.setContext(buildContext());

  // Before the view changes: close menus, drawers, the "More" sheet, the palette and the data popover.
  on('ui:route-leave', (payload) => {
    closeTransientUi();
    if (payload && payload.to) markActive(payload.to);
  });
  // Scroll position is owned by the router (top for new navigations, restored on back / forward / language change).
  on('route:change', (payload) => {
    const id = payload && payload.id;
    markActive(id);
    setRailOpen(false);
    // A real navigation closes the overlay panel; a re-mount in place (language / numerals) keeps it.
    if (!payload || payload.previousId !== id) maybeCloseOverlayPanel();
    closeTransientUi();
  });
  on('settings:change', handleSettingsChange);
  on('theme:change', () => applySettings());
  on('lang:change', onLangChange);

  if (views.length) {
    router.start(homeViewId());
    const cur = router.current ? router.current() : null;
    if (cur && cur.id) markActive(cur.id);
  } else {
    renderShellEmpty(main);
    document.title = `${t('core.app.name')} — ${t('core.app.full')}`;
  }

  if (live && typeof live.start === 'function') {
    try { live.start({ store, bus }); } catch (err) { reportError(err, 'live.start'); }
  }
  if (platformLive && typeof platformLive.start === 'function') {
    try { platformLive.start({ store, bus }); } catch (err) { reportError(err, 'platformLive.start'); }
  }

  // `views` = the registered entries (static metas; `loaded`/`render` appear once a module is imported).
  window.biltix = Object.freeze({ store, bus, router, live, sel, fmt, psel, platformLive, i18n, status, motion, ready: true, views: Object.freeze(views.slice()), missingModules: Object.freeze(missingModules.slice()) });
  document.body.classList.remove('is-booting');
  document.body.classList.add('is-ready');
}

boot().catch((err) => reportError(err, 'boot'));
