/**
 * Biltix Risk AI — application bootstrap (app shell wiring).
 *
 * Order of work (docs/ARCHITECTURE.md §9, §12, §B7):
 *   optional modules → settings → art mount → grouped rail / tab bar (from the static view
 *   registry, modules imported lazily on first navigation / hover prefetch) → filters → feed →
 *   clock → integrations pill → consolidated score pill → notifications (bell, banner, one
 *   assertive live region for critical alerts) → theme & rail toggles → command palette →
 *   router → live engines.
 *
 * Resilience: the core (store, bus, fmt, sel, router, components, views registry) is imported
 * statically; charts / radar / art / live / sources / psel / platformLive are loaded through
 * guarded dynamic imports so a module that is missing or broken degrades to a stub and the
 * HSE pillar still boots (one console.warn lists what was skipped, never console.error).
 * Clock / feed-time intervals pause while the tab is hidden; transient UI (bell drawer, "المزيد"
 * sheet, command palette, anchored menus) closes on `ui:route-leave`; input modality is tracked
 * on <html data-input="keyboard"|"pointer"> for focus-ring styling.
 *
 * Everything that comes from data or user input reaches the DOM through textContent /
 * setAttribute. No innerHTML anywhere in this file.
 */
import { store } from './core/store.js';
import { bus } from './core/bus.js';
import { fmt } from './core/fmt.js';
import { sel } from './core/selectors.js';
import { router } from './core/router.js';
import * as components from './ui/components.js';
import { navGroups, views as navViews, loadView, navMeta, TAB_IDS, DEFAULT_VIEW, FALLBACK_VIEW } from './views/index.js';

const { h, clear, glyph, badge, button, toast, drawer, segmented, liveDot, emptyState } = components;

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
/** Latin code tokens inside Arabic copy (AIR-1042, CT-2026-014, PTW-5521, R-1001 …); U+2011 hyphens from the live engines match too. */
const CODE_TOKEN_RE = /\b[A-Z]{1,5}[-\u2011][A-Z0-9\u2011-]*\d[A-Z0-9\u2011-]*\b/g;
/** Digit runs that stand alone (not glued to Latin letters such as H2S, PM2.5, O2) follow the numerals setting. */
const STANDALONE_DIGITS_RE = /(?<![A-Za-z0-9.])\d+(?:[.,]\d+)?(?![A-Za-z])/g;

const STORAGE_KEY = 'biltix-hse:v1';
const APP_VERSION = '2.0.0';
const APP_TITLE = 'بلتكس Risk AI';
const RIYADH_TZ = 'Asia/Riyadh';
const FEED_CAP = 200;
const ALERT_CAP = 30;
const BANNER_MS = 12000;
const TONES = ['neutral', 'good', 'warning', 'serious', 'critical', 'brand', 'accent'];
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RATINGS = ['red', 'yellow', 'green'];
const RATING_LABELS = { red: 'أحمر', yellow: 'أصفر', green: 'أخضر' };
const RATING_TONES = { red: 'critical', yellow: 'warning', green: 'good' };

/* ------------------------------------------------------------------ */
/* Optional module loading                                             */
/* ------------------------------------------------------------------ */

async function optionalModule(path, pickExport) {
  try {
    const mod = await import(path);
    const value = typeof pickExport === 'function' ? pickExport(mod) : mod;
    if (value === null || value === undefined) throw new Error('التصدير المتوقع غير موجود');
    return value;
  } catch (err) {
    missingModules.push(`${path} — ${err && err.message ? err.message : err}`);
    return null;
  }
}

async function loadOptionalModules() {
  const [c, r, a, l, s, p, pl] = await Promise.all([
    optionalModule('./ui/charts.js', (m) => m.charts || m.default),
    optionalModule('./ui/radar.js', (m) => m),
    optionalModule('./ui/art.js', (m) => m.art || m.default),
    optionalModule('./data/live.js', (m) => m.live || m.default),
    optionalModule('./data/sources.js', (m) => m.sources || m.default),
    optionalModule('./core/platform-selectors.js', (m) => m.psel || m.default),
    optionalModule('./data/platform-live.js', (m) => m.platformLive || m.default),
  ]);
  charts = c || {}; radar = r || {}; art = a || {}; live = l; sources = s; psel = p; platformLive = pl;
  if (missingModules.length) {
    console.warn(`[${APP_TITLE}] ${missingModules.length} وحدات اختيارية غير متاحة بعد — يعمل الهيكل ببدائل مؤقتة:\n  • ${missingModules.join('\n  • ')}`);
  }
}

/* Rating helpers that prefer psel (single definition) and fall back to §B2 locally. */
function ratingOf(score) {
  try { if (psel && typeof psel.rating === 'function') return psel.rating(score); } catch { /* fall through */ }
  const n = Number(score) || 0;
  return n >= 70 ? 'red' : n >= 40 ? 'yellow' : 'green';
}
function ratingLabel(rating) {
  try { if (psel && typeof psel.ratingLabel === 'function') { const l = psel.ratingLabel(rating); if (l) return l; } } catch { /* fall through */ }
  return RATING_LABELS[rating] || '';
}
function ratingTone(rating) {
  try { if (psel && typeof psel.ratingTone === 'function') { const t = psel.ratingTone(rating); if (TONES.includes(t)) return t; } } catch { /* fall through */ }
  return RATING_TONES[rating] || 'neutral';
}
const platformState = () => (store.state && store.state.platform && typeof store.state.platform === 'object' ? store.state.platform : {});
const platformList = (key) => (Array.isArray(platformState()[key]) ? platformState()[key] : []);

/*
 * Provisional debug hooks (§12): the core is ready as soon as this module evaluates, so the QA
 * harness / devtools can call store.setSettings({theme}) while the optional modules are still
 * loading; boot() replaces this with the frozen, complete object.
 */
window.biltix = { store, bus, router, sel, fmt, live: null, psel: null, platformLive: null, ready: false, views: navViews };

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const toneOf = (t) => (TONES.includes(t) ? t : 'neutral');
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
    // Plain ASCII hyphens inside the code (copy / search friendly); the span itself is nowrap + LTR.
    frag.appendChild(h('span', { class: 'code mono nowrap', dir: 'ltr', lang: 'en' }, m[0].replace(/\u2011/g, '-')));
    last = m.index + m[0].length;
  }
  if (last < str.length) frag.appendChild(document.createTextNode(localizeText(str.slice(last))));
  return frag;
}

/** Plain-text twin of richText (for aria-labels / live regions): U+2011 hyphens in codes become '-'. */
function plainCodes(value) {
  return String(value == null ? '' : value).replace(CODE_TOKEN_RE, (m) => m.replace(/\u2011/g, '-'));
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
/* Error surface (window error / unhandledrejection → Arabic toast)    */
/* ------------------------------------------------------------------ */

const reportedErrors = new Set();
function reportError(err, context = '') {
  const message = err && err.message ? err.message : String(err || 'خطأ غير معروف');
  const key = `${context}|${message}`;
  if (reportedErrors.has(key)) return;
  reportedErrors.add(key);
  console.error(context ? `[${APP_TITLE}] ${context}:` : `[${APP_TITLE}]`, err);
  try {
    toast('حدث خطأ غير متوقع في الواجهة. تم تسجيل التفاصيل في وحدة التحكم، وتستمر بقية الأنظمة في العمل.', { tone: 'serious', timeout: 7000, title: 'تنبيه تقني' });
  } catch { /* toast host not ready */ }
}

window.addEventListener('error', (e) => { reportError(e.error || e.message, 'window.error'); });
window.addEventListener('unhandledrejection', (e) => { reportError(e.reason, 'unhandledrejection'); });

/* ------------------------------------------------------------------ */
/* Settings → document                                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_BRAND = { primary: '', accent: '', companyName: 'بلتكس', logoUrl: '' }; // empty = use css/tokens.css values
let appliedNumerals = null;

function applySettings(s = settings()) {
  const root = document.documentElement;
  const theme = s.theme === 'light' ? 'light' : 'dark';
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
  syncThemeColorMeta();

  const brand = { ...DEFAULT_BRAND, ...(s.brand || {}) };
  applyBrandColors(brand);

  const numerals = s.numerals === 'arab' ? 'arab' : 'latn';
  root.setAttribute('data-numerals', numerals);
  if (numerals !== appliedNumerals) {
    appliedNumerals = numerals;
    try { fmt.setNumerals(numerals); } catch (err) { reportError(err, 'fmt.setNumerals'); }
    rebuildClockFormatters(numerals);
  }

  // settings.motion: 'auto' (follow the OS) | 'reduce' | 'full' — legacy boolean settings.reducedMotion maps to 'reduce'.
  const motion = s.motion === 'reduce' || s.motion === 'full' ? s.motion : (s.reducedMotion ? 'reduce' : 'auto');
  if (motion === 'auto') root.removeAttribute('data-motion'); else root.setAttribute('data-motion', motion);
  document.body.classList.toggle('rail-collapsed', !!s.railCollapsed);
  document.body.classList.toggle('feed-paused', !!s.feedPaused);

  const themeBtn = $('themeBtn');
  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    themeBtn.setAttribute('aria-label', theme === 'light' ? 'التبديل إلى السمة الداكنة' : 'التبديل إلى السمة الفاتحة');
  }
  const railToggle = $('railToggle');
  if (railToggle) {
    railToggle.setAttribute('aria-expanded', s.railCollapsed ? 'false' : 'true');
    railToggle.setAttribute('aria-label', s.railCollapsed ? 'توسيع شريط التنقل' : 'طيّ شريط التنقل');
  }
  applyBrandText(brand);
  syncFeedToggle(!!s.feedPaused);
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

function applyBrandText(brand) {
  const name = document.querySelector('.brand-name');
  const company = (brand.companyName || DEFAULT_BRAND.companyName).trim();
  if (name) name.textContent = `${company} Risk AI`;
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
    .map((g) => ({ ...g, members: g.viewIds.map((id) => pool.find((v) => v.id === id)).filter(Boolean) }))
    .filter((g) => g.members.length);
  const grouped = new Set(navGroups.flatMap((g) => g.viewIds));
  const rest = pool.filter((v) => !grouped.has(v.id) && poolIds.has(v.id));
  if (rest.length) groups.push({ id: 'other', label: 'أقسام أخرى', viewIds: rest.map((v) => v.id), members: rest });
  return groups;
}

/** Warm a lazy view module on hover / focus so the click paints instantly. */
function prefetchView(id) {
  try { const p = loadView(id); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch { /* ignore */ }
}

function navItem(view, { compact = false } = {}) {
  const meta = navMeta(view);
  const fullTitle = `${meta.title}${meta.code ? ` · ${meta.code}` : ''}`;
  const label = compact ? meta.tabTitle : meta.shortTitle;
  const btn = h('button', {
    type: 'button', class: compact ? 'tab-item' : 'rail-item', 'data-view': view.id,
    // The visible label may be the short form (and hidden when the rail is collapsed): the
    // accessible name always carries the full title.
    'aria-label': compact ? meta.title : fullTitle,
    title: compact ? undefined : fullTitle, onClick: () => router.navigate(view.id),
    onPointerenter: () => prefetchView(view.id), onFocus: () => prefetchView(view.id),
  });
  btn.appendChild(h('span', { class: compact ? 'tab-icon' : 'rail-icon', 'aria-hidden': 'true' }, iconFor(view.icon, compact ? 22 : 20)));
  btn.appendChild(h('span', { class: compact ? 'tab-label' : 'rail-label' }, label));
  if (!compact) btn.appendChild(h('span', { class: 'rail-code mono', 'aria-hidden': 'true' }, meta.code));
  return btn;
}

function buildRail() {
  const list = $('railList');
  if (!list) return;
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
  const version = $('railVersion');
  if (version) version.textContent = `v${APP_VERSION}`;
}

/** Bottom tab bar: cockpit, airisks, overview, radar (+ next available when one is missing) and "المزيد". */
function buildTabbar() {
  const bar = $('tabbar');
  if (!bar) return;
  clear(bar);
  tabButtons.clear();
  const primary = TAB_IDS.map(viewById).filter(Boolean);
  for (const view of views) {
    if (primary.length >= TAB_IDS.length) break;
    if (!primary.includes(view)) primary.push(view);
  }
  const rest = views.filter((v) => !primary.includes(v));
  primary.forEach((view) => { const b = navItem(view, { compact: true }); tabButtons.set(view.id, b); bar.appendChild(b); });
  if (rest.length) {
    const more = h('button', { type: 'button', class: 'tab-item tab-more', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onClick: () => openMoreSheet(rest, more) });
    more.appendChild(h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, glyph('grip', 22)));
    more.appendChild(h('span', { class: 'tab-label' }, 'المزيد'));
    bar.appendChild(more);
    tabButtons.set('__more', more);
  }
}

function openMoreSheet(rest, anchor) {
  if (moreDrawer && moreDrawer.isOpen()) { moreDrawer.close(); return; }
  const current = router.current ? router.current() : { id: null };
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
      b.appendChild(h('span', { class: 'sheet-code mono', 'aria-hidden': 'true' }, meta.code));
      list.appendChild(h('li', {}, b));
    });
  });
  anchor.setAttribute('aria-expanded', 'true');
  moreDrawer = drawer({ title: 'المزيد من الأقسام', subtitle: 'جميع أقسام منصة إدارة المخاطر', body: list, onClose: () => anchor.setAttribute('aria-expanded', 'false') });
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

function rangeLabel(days) {
  const n = fmt.num(days);
  if (days === 7) return `${n} أيام`;
  return `${n} يوماً`;
}

function buildFilters() {
  const site = $('siteSelect');
  if (site) {
    clear(site);
    site.appendChild(h('option', { value: 'all' }, 'جميع المشاريع'));
    ((store.state && store.state.sites) || []).forEach((s) => {
      site.appendChild(h('option', { value: s.id }, `${s.code} — ${s.name}`));
    });
    site.value = filters().siteId || 'all';
    site.addEventListener('change', () => store.setFilter('siteId', site.value || 'all'));
  }

  const rangeHost = $('rangeSeg');
  if (rangeHost) {
    clear(rangeHost);
    rangeSeg = segmented({
      options: RANGES.map((d) => ({ value: d, label: rangeLabel(d) })),
      value: Number(filters().range) || 30,
      ariaLabel: 'الفترة الزمنية',
      onChange: (v) => store.setFilter('range', Number(v)),
    });
    rangeHost.appendChild(rangeSeg.el);
  }

  const search = $('searchInput');
  if (search) {
    search.value = filters().search || '';
    const push = debounce((value) => store.setFilter('search', value.trim()), 200);
    search.addEventListener('input', () => push(search.value));
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { search.value = ''; push.cancel(); store.setFilter('search', ''); } });
  }

  const feedToggle = $('feedToggle');
  if (feedToggle) feedToggle.addEventListener('click', () => store.setSettings({ feedPaused: !settings().feedPaused }));

  const feedOpen = $('feedOpen');
  const feedClose = $('feedClose');
  if (feedOpen) feedOpen.addEventListener('click', () => setFeedOpen(!document.body.classList.contains('feed-open')));
  if (feedClose) feedClose.addEventListener('click', () => setFeedOpen(false));

  on('filters:change', (payload) => {
    const f = (payload && payload.filters) || filters();
    if (site && site.value !== String(f.siteId || 'all')) site.value = String(f.siteId || 'all');
    if (rangeSeg) rangeSeg.set(Number(f.range) || 30);
    if (search && document.activeElement !== search && search.value !== (f.search || '')) search.value = f.search || '';
  });
}

function refreshRangeLabels() {
  const host = $('rangeSeg');
  if (!host || !rangeSeg) return;
  host.querySelectorAll('.seg-btn').forEach((btn) => {
    const d = Number(btn.dataset.value);
    const span = btn.querySelector('span');
    if (span && RANGES.includes(d)) span.textContent = rangeLabel(d);
  });
}

function syncFeedToggle(paused) {
  const btn = $('feedToggle');
  if (btn) {
    btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    btn.classList.toggle('is-paused', paused);
    const label = btn.querySelector('.feed-toggle-label');
    if (label) label.textContent = paused ? 'استئناف البث' : 'إيقاف البث';
    const dot = btn.querySelector('.live-dot');
    if (dot) dot.classList.toggle('is-paused', paused);
  }
  const feedLive = $('feedLive');
  if (feedLive) feedLive.classList.toggle('is-paused', paused);
  const status = $('feedStatus');
  if (status) status.textContent = paused ? 'البث متوقف مؤقتاً — القراءات الحية مستمرة' : 'متصل بالأنظمة الحية';
  const feed = $('feed');
  if (feed) feed.classList.toggle('is-paused', paused);
}

function setFeedOpen(open) {
  document.body.classList.toggle('feed-open', open);
  const feed = $('feed');
  if (feed) feed.classList.toggle('is-open', open);
  const opener = $('feedOpen');
  if (opener) opener.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) { const close = $('feedClose'); if (close) close.focus(); }
  else if (opener && document.activeElement && feed && feed.contains(document.activeElement)) opener.focus();
}

/* ------------------------------------------------------------------ */
/* Live feed                                                           */
/* ------------------------------------------------------------------ */

const FEED_ICONS = {
  sensor: 'sensor', permit: 'permit', incident: 'incident', nearmiss: 'nearmiss', inspection: 'inspection',
  training: 'training', integration: 'integration', ppe: 'ppe', weather: 'weather', alert: 'alert', risk: 'risk',
  // Part B (§B6) event types
  ai: 'ai', validation: 'badge-check', connector: 'integration', writeback: 'sync', task: 'file-check',
};
const FEED_TYPE_LABELS = {
  sensor: 'حساس', permit: 'تصريح عمل', incident: 'حادث', nearmiss: 'حادث وشيك', inspection: 'تفتيش',
  training: 'تدريب', integration: 'تكامل', ppe: 'معدات الوقاية', weather: 'طقس', alert: 'تنبيه', risk: 'مخاطرة',
  ai: 'محرك الذكاء الاصطناعي', validation: 'طبقة التحقق', connector: 'موصل مؤسسي', writeback: 'كتابة عكسية', task: 'مهمة معالجة',
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

/** Resolve a feed sourceId to a display name: Part A integrations, platform connectors or pipelines. */
function feedSourceName(sourceId) {
  if (!sourceId) return '';
  const integ = ((store.state && store.state.integrations) || []).find((i) => i && i.id === sourceId);
  if (integ) return integ.name || '';
  const conn = platformList('connectors').find((c) => c && c.id === sourceId);
  if (conn) return conn.name || '';
  const pipe = platformList('pipelines').find((p) => p && p.id === sourceId);
  if (pipe) return pipe.nameAr || pipe.name || '';
  return '';
}

function feedItem(ev, { fresh = false } = {}) {
  const tone = toneOf(ev.tone || 'neutral');
  const type = FEED_ICONS[ev.type] ? ev.type : 'alert';
  const route = FEED_ROUTES[type] && viewById(FEED_ROUTES[type](ev)[0]) && (type === 'connector' || type === 'validation' || ev.refId) ? FEED_ROUTES[type](ev) : null;
  const li = h('li', {
    class: ['feed-item', `tone-${tone}`, `type-${type}`, fresh ? 'is-new' : null, route ? 'is-clickable' : null],
    'data-id': ev.id || undefined, 'data-type': type, tabindex: route ? '0' : undefined, role: route ? 'link' : undefined,
    onClick: route ? () => router.navigate(route[0], route[1]) : undefined,
    onKeydown: route ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.navigate(route[0], route[1]); } } : undefined,
  });
  li.appendChild(h('span', { class: ['feed-tone', `tone-${tone}`], 'aria-hidden': 'true' }));
  li.appendChild(h('span', { class: 'feed-icon', 'aria-hidden': 'true' }, iconFor(FEED_ICONS[type], 16, tone)));
  const body = h('div', { class: 'feed-body' });
  const row = h('div', { class: 'feed-title-row' });
  // Codes stay LTR / unbroken, digits follow the numerals setting (RTL-4 / RTL-5).
  row.appendChild(h('strong', { class: 'feed-title' }, richText(ev.title || FEED_TYPE_LABELS[type])));
  const time = h('time', { class: 'feed-time mono', datetime: ev.ts || '' }, safeRelative(ev.ts));
  time.dataset.ts = ev.ts || '';
  feedTimes.add(time);
  row.appendChild(time);
  body.appendChild(row);
  if (ev.detail) body.appendChild(h('p', { class: 'feed-detail' }, richText(ev.detail)));
  const meta = h('div', { class: 'feed-meta' });
  meta.appendChild(h('span', { class: 'feed-type' }, FEED_TYPE_LABELS[type]));
  const site = siteById(ev.siteId);
  if (site) meta.appendChild(h('span', { class: 'feed-site' }, site.name));
  const sourceName = feedSourceName(ev.sourceId);
  if (sourceName) meta.appendChild(h('span', { class: 'feed-source' }, sourceName));
  // Events that carry a numeric reading render it through fmt (never raw digits) — unless the
  // sentence already spells that reading out (the live engines format their own copy).
  if (ev.value !== null && ev.value !== undefined && ev.value !== '' && Number.isFinite(Number(ev.value))) {
    const digits = Math.abs(Number(ev.value)) < 10 ? 1 : 0;
    const reading = fmt.num(Number(ev.value), { maximumFractionDigits: digits });
    const sentence = localizeText(`${ev.title || ''} ${ev.detail || ''}`);
    if (!sentence.includes(reading)) {
      meta.appendChild(h('span', { class: 'feed-value mono num' }, `${reading}${ev.unit ? ` ${ev.unit}` : ''}`));
    }
  }
  body.appendChild(meta);
  li.appendChild(body);
  if (route) li.setAttribute('aria-label', `${FEED_TYPE_LABELS[type]}: ${plainCodes(ev.title || '')}`);
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
  for (const t of feedTimes) if (!t.isConnected) feedTimes.delete(t);
}

function refreshFeedTimes() {
  pruneFeedTimes();
  for (const t of feedTimes) {
    const next = safeRelative(t.dataset.ts);
    if (t.textContent !== next) t.textContent = next;
  }
}

function updateFeedCount() {
  const count = $('feedCountValue') || $('feedCount');
  const list = $('feedList');
  if (count && list) count.textContent = fmt.num(list.querySelectorAll('.feed-item').length);
}

/** (Re)build the feed list from the store (boot, and after a numerals change so digits re-localise). */
function renderFeedList() {
  const list = $('feedList');
  if (!list) return;
  clear(list);
  pruneFeedTimes();
  const existing = ((store.state && store.state.feed) || []).slice(0, FEED_CAP);
  const frag = document.createDocumentFragment();
  existing.forEach((ev) => frag.appendChild(feedItem(ev)));
  list.appendChild(frag);
  if (!existing.length) list.appendChild(h('li', { class: 'feed-empty' }, emptyState({ icon: glyph('accent', 28), title: 'بانتظار أول حدث من الأنظمة المتصلة', text: 'يبدأ البث الحي تلقائياً خلال ثوانٍ.' })));
  updateFeedCount();
}

function buildFeed() {
  const list = $('feedList');
  if (!list) return;
  renderFeedList();

  on('feed:event', (ev) => {
    if (!ev || typeof ev !== 'object') return;
    const empty = list.querySelector('.feed-empty');
    if (empty) empty.remove();
    list.insertBefore(feedItem(ev, { fresh: true }), list.firstChild);
    while (list.children.length > FEED_CAP) list.lastChild.remove();
    pruneFeedTimes();
    updateFeedCount();
  });

  pausableInterval(refreshFeedTimes, 30000);

  const all = $('feedAll');
  if (all) all.addEventListener('click', openFeedArchive);
}

function openFeedArchive() {
  const items = ((store.state && store.state.feed) || []).slice(0, FEED_CAP);
  const list = h('ul', { class: 'feed-list is-archive', role: 'list' });
  if (!items.length) list.appendChild(h('li', {}, emptyState({ title: 'لا توجد أحداث بعد' })));
  items.forEach((ev) => list.appendChild(feedItem(ev)));
  const d = drawer({
    title: 'سجل البث الحي', subtitle: `آخر ${fmt.num(items.length)} حدثاً من الأنظمة المتصلة`, body: list, size: 'lg',
    actions: [{ label: 'تصدير JSON', variant: 'outline', closes: false, onClick: () => exportFeed(items) }, { label: 'إغلاق', variant: 'ghost' }],
    onClose: pruneFeedTimes,
  });
  d.open();
}

function canExport() {
  if (sources && typeof sources.exportJSON === 'function') return true;
  toast('وحدة التصدير غير متاحة حالياً.', { tone: 'warning', timeout: 3500 });
  return false;
}

function exportFeed(items) {
  if (!canExport()) return;
  try { sources.exportJSON({ exportedAt: new Date().toISOString(), count: items.length, feed: items }, 'biltix-risk-ai-feed.json'); toast('تم تصدير سجل البث بصيغة JSON.', { tone: 'good' }); }
  catch (err) { reportError(err, 'exportFeed'); }
}

/* ------------------------------------------------------------------ */
/* Clock (Asia/Riyadh)                                                 */
/* ------------------------------------------------------------------ */

let timeFormatter = null;
let lastDateKey = '';

function rebuildClockFormatters(numerals = appliedNumerals || 'latn') {
  const locale = numerals === 'arab' ? 'ar-SA' : 'ar-SA-u-nu-latn';
  try { timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: RIYADH_TZ }); }
  catch { timeFormatter = null; }
  lastDateKey = '';
}

function tickClock() {
  const now = new Date();
  const timeEl = $('clockTime');
  if (timeEl) {
    let text = '';
    if (timeFormatter) text = timeFormatter.format(now);
    else { try { text = fmt.time(now.toISOString()); } catch { text = ''; } }
    if (timeEl.textContent !== text) timeEl.textContent = text;
    timeEl.setAttribute('datetime', now.toISOString());
  }
  // Day-granular parts refresh only when the Riyadh calendar day changes.
  let dayKey = '';
  try { dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: RIYADH_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); } catch { dayKey = now.toDateString(); }
  if (dayKey !== lastDateKey) {
    lastDateKey = dayKey;
    const dateEl = $('clockDate');
    const hijriEl = $('clockHijri');
    if (dateEl) { try { dateEl.textContent = `${fmt.dayName(now.toISOString())}، ${fmt.date(now.toISOString())}`; } catch { dateEl.textContent = ''; } }
    if (hijriEl) { try { hijriEl.textContent = fmt.hijri(now); } catch { hijriEl.textContent = ''; } }
  }
}

function startClock() {
  rebuildClockFormatters();
  tickClock();
  pausableInterval(tickClock, 1000); // paused while document.hidden, ticks immediately on return
}

/* ------------------------------------------------------------------ */
/* Integrations pill                                                   */
/* ------------------------------------------------------------------ */

/** Counts Part A integrations AND platform connectors (§B7). */
function refreshIntegrationsPill() {
  const pill = $('integrationsPill');
  const count = $('integrationsCount');
  if (!pill || !count) return;
  const list = [...((store.state && store.state.integrations) || []), ...platformList('connectors')].filter(Boolean);
  const connected = list.filter((i) => i.status === 'connected').length;
  const degraded = list.filter((i) => i.status === 'degraded').length;
  const down = list.filter((i) => i.status === 'disconnected').length;
  count.textContent = `${fmt.num(connected)}/${fmt.num(list.length)}`;
  const tone = down > 0 ? 'serious' : degraded > 0 ? 'warning' : 'good';
  pill.dataset.tone = tone;
  const dot = pill.querySelector('.live-dot');
  if (dot) { TONES.forEach((t) => dot.classList.remove(`tone-${t}`)); dot.classList.add(`tone-${tone === 'good' ? 'accent' : tone}`); }
  const parts = [`${fmt.num(connected)} من ${fmt.num(list.length)} تكاملاً وموصلاً متصلاً`];
  if (degraded) parts.push(`${fmt.num(degraded)} متدهور`);
  if (down) parts.push(`${fmt.num(down)} منقطع`);
  pill.setAttribute('aria-label', `حالة التكاملات والموصلات: ${parts.join('، ')}`);
  pill.title = parts.join(' · ');
}

function buildIntegrationsPill() {
  const pill = $('integrationsPill');
  if (pill) pill.addEventListener('click', () => router.navigate('integrations'));
  refreshIntegrationsPill();
  on('integrations:tick', refreshIntegrationsPill);
  on('store:change', (p) => {
    const path = p && p.path ? String(p.path) : '*';
    if (path === '*' || path.startsWith('integrations') || path.startsWith('platform.connectors')) refreshIntegrationsPill();
  });
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
  const value = $('scoreValue');
  if (value) value.textContent = fmt.num(score);
  const labelEl = $('scoreLabel');
  if (labelEl) labelEl.textContent = `الدرجة الموحدة · ${label}`;
  const deltaEl = $('scoreDelta');
  const delta = data && Number.isFinite(Number(data.delta)) ? Number(data.delta) : 0;
  if (deltaEl) {
    const show = delta !== 0;
    deltaEl.hidden = !show;
    deltaEl.textContent = show ? fmt.signed(delta) : '';
    deltaEl.classList.toggle('is-up', delta > 0);
    deltaEl.classList.toggle('is-down', delta < 0);
  }
  const deltaText = delta !== 0 ? `، التغير مقارنة بالفترة السابقة ${fmt.signed(delta)}` : '';
  pill.setAttribute('aria-label', `الدرجة الموحدة للمخاطر ${fmt.num(score)} من 100 — تصنيف ${label}${deltaText}. فتح قمرة القيادة`);
  pill.title = `الدرجة الموحدة ${fmt.num(score)}/100 · ${label}${deltaText} — فتح قمرة القيادة`;
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

function alertTone(payload) {
  if (!payload) return 'warning';
  if (TONES.includes(payload.tone)) return payload.tone;
  const sev = payload.severity;
  if (typeof sev === 'string') return TONES.includes(sev) ? sev : (sev === 'high' ? 'serious' : 'warning');
  if (typeof sev === 'number') return sev >= 4 ? 'critical' : sev === 3 ? 'serious' : 'warning';
  return 'warning';
}

function updateBell() {
  const count = $('bellCount');
  const bell = $('bellBtn');
  if (count) {
    count.textContent = fmt.num(Math.min(unreadAlerts, 99));
    count.hidden = unreadAlerts === 0;
  }
  if (bell) {
    bell.classList.toggle('has-unread', unreadAlerts > 0);
    bell.setAttribute('aria-label', unreadAlerts > 0 ? `التنبيهات — ${fmt.num(unreadAlerts)} غير مقروء` : 'التنبيهات');
  }
}

function alertRow(a) {
  const li = h('li', { class: ['alert-item', `tone-${a.tone}`] });
  li.appendChild(badge(a.tone === 'critical' ? 'حرج' : a.tone === 'serious' ? 'عالٍ' : a.tone === 'warning' ? 'تحذير' : 'معلومة', a.tone));
  const body = h('div', { class: 'alert-item-body' });
  body.appendChild(h('strong', { class: 'alert-item-title' }, richText(a.title || 'تنبيه')));
  if (a.detail) body.appendChild(h('p', { class: 'alert-item-detail' }, richText(a.detail)));
  const meta = h('div', { class: 'alert-item-meta' });
  const site = siteById(a.siteId);
  if (site) meta.appendChild(h('span', {}, site.name));
  meta.appendChild(h('time', { class: 'mono', datetime: a.ts }, safeRelative(a.ts)));
  body.appendChild(meta);
  li.appendChild(body);
  return li;
}

function openBellDrawer() {
  if (bellDrawer && bellDrawer.isOpen()) { bellDrawer.close(); return; }
  unreadAlerts = 0; updateBell();
  const list = h('ul', { class: 'alert-list', role: 'list' });
  if (!alerts.length) list.appendChild(h('li', {}, emptyState({ icon: glyph('good', 30), title: 'لا توجد تنبيهات', text: 'ستظهر هنا التنبيهات الحرجة والتحذيرات الواردة من الحساسات والأنظمة المتصلة.' })));
  alerts.forEach((a) => list.appendChild(alertRow(a)));
  bellDrawer = drawer({
    title: 'التنبيهات', subtitle: `آخر ${fmt.num(alerts.length)} تنبيهاً`, body: list,
    actions: [
      { label: 'مسح الكل', variant: 'outline', onClick: () => { alerts.length = 0; unreadAlerts = 0; updateBell(); toast('تم مسح قائمة التنبيهات.', { tone: 'neutral' }); } },
      { label: 'إغلاق', variant: 'ghost' },
    ],
  });
  bellDrawer.open();
}

function showBanner(a) {
  const banner = $('alertBanner');
  if (!banner) return;
  clear(banner);
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  TONES.forEach((t) => banner.classList.remove(`tone-${t}`));
  banner.classList.add(`tone-${a.tone}`);
  banner.appendChild(h('span', { class: 'alert-banner-icon', 'aria-hidden': 'true' }, glyph(a.tone, 20)));
  const text = h('div', { class: 'alert-banner-text' });
  text.appendChild(h('strong', { class: 'alert-banner-title' }, richText(a.title || 'تنبيه حرج')));
  const detailParts = [];
  if (a.detail) detailParts.push(String(a.detail));
  const site = siteById(a.siteId);
  if (site) detailParts.push(site.name);
  if (detailParts.length) text.appendChild(h('span', { class: 'alert-banner-detail' }, richText(detailParts.join(' — '))));
  banner.appendChild(text);
  const actions = h('div', { class: 'alert-banner-actions' });
  if (a.riskId && viewById('airisks')) {
    actions.appendChild(button('فتح المخاطرة', { variant: 'outline', size: 'sm', onClick: () => { hideBanner(); router.navigate('airisks', { risk: a.riskId }); } }));
  } else {
    actions.appendChild(button('فتح الرادار', { variant: 'outline', size: 'sm', onClick: () => { hideBanner(); router.navigate('radar', a.siteId ? { site: a.siteId } : {}); } }));
  }
  actions.appendChild(button('', { variant: 'ghost', size: 'sm', icon: glyph('close', 16), onClick: hideBanner, attrs: { 'aria-label': 'إغلاق التنبيه' } }));
  banner.appendChild(actions);
  banner.hidden = false;
  document.body.classList.add('has-banner');
  requestAnimationFrame(() => banner.classList.add('is-open'));
  bannerTimer = setTimeout(hideBanner, BANNER_MS);
}

function hideBanner() {
  const banner = $('alertBanner');
  if (!banner) return;
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  banner.classList.remove('is-open');
  const done = () => { banner.hidden = true; document.body.classList.remove('has-banner'); clear(banner); };
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
  const text = [a.tone === 'critical' ? 'تنبيه حرج' : 'تنبيه عالٍ', plainCodes(a.title), plainCodes(a.detail), site && site.name].filter(Boolean).join('، ');
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
    const msg = [a.detail, site && site.name].filter(Boolean).join(' — ');
    const shown = toast(msg || plainCodes(a.title) || 'تنبيه جديد', { tone: a.tone, title: msg ? plainCodes(a.title) : '', timeout: a.tone === 'critical' ? 9000 : 5500, action: { label: 'عرض', onClick: openBellDrawer } });
    // Critical / serious alerts are spoken once, by #liveAnnouncer: their toast (role=alert) stays
    // visible but is taken out of the live-region machinery so screen readers do not repeat it.
    if (shown && shown.el && (a.tone === 'critical' || a.tone === 'serious')) shown.el.removeAttribute('role');
    if (a.tone === 'critical') showBanner(a);
    announceAlert(a);
  });
}

/** Close every transient surface before the view changes (bell drawer, "المزيد" sheet, palette, menus). */
function closeTransientUi() {
  if (bellDrawer && bellDrawer.isOpen()) bellDrawer.close();
  if (moreDrawer && moreDrawer.isOpen()) moreDrawer.close();
  if (cmdk.open) closeCmdk();
  document.querySelectorAll('.menu.is-open').forEach((menu) => { try { if (typeof menu.__close === 'function') menu.__close(); else menu.remove(); } catch { /* ignore */ } });
}

/* ------------------------------------------------------------------ */
/* Theme & rail toggles                                                */
/* ------------------------------------------------------------------ */

function toggleTheme() {
  const next = settings().theme === 'light' ? 'dark' : 'light';
  store.setSettings({ theme: next });
  toast(next === 'light' ? 'تم تفعيل السمة الفاتحة.' : 'تم تفعيل السمة الداكنة.', { tone: 'neutral', timeout: 2200 });
}

function toggleFeedPaused() {
  const paused = !settings().feedPaused;
  store.setSettings({ feedPaused: paused });
  toast(paused ? 'تم إيقاف البث الحي مؤقتاً. القراءات الحية مستمرة في الخلفية.' : 'تم استئناف البث الحي.', { tone: paused ? 'warning' : 'good', timeout: 2600 });
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
  const toggle = $('railToggle');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function buildToggles() {
  const themeBtn = $('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  const railToggle = $('railToggle');
  if (railToggle) railToggle.addEventListener('click', toggleRail);
  const userChip = $('userChip');
  if (userChip) userChip.addEventListener('click', () => router.navigate('settings'));

  // Layout mode transitions: close overlays that only exist in narrower layouts.
  const wide = window.matchMedia('(min-width: 1280px)');
  const onWide = () => { if (wide.matches) { setFeedOpen(false); setRailOpen(false); } };
  if (typeof wide.addEventListener === 'function') wide.addEventListener('change', onWide); else wide.addListener(onWide);
  const narrow = narrowQuery();
  const onNarrow = () => { if (!narrow.matches) setRailOpen(false); };
  if (typeof narrow.addEventListener === 'function') narrow.addEventListener('change', onNarrow); else narrow.addListener(onNarrow);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('feed-open')) setFeedOpen(false);
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
  const q = normalizeText(query); const t = normalizeText(text);
  if (!q || !t) return 0;
  if (t === q) return 120;
  if (t.startsWith(q)) return 100;
  const idx = t.indexOf(q);
  if (idx >= 0) return 80 - Math.min(idx, 30) * 0.5;
  if (t.split(' ').some((w) => w.startsWith(q))) return 70;
  // subsequence match with gap penalty
  let ti = 0; let gaps = 0; let matched = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
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
  const groupLabel = (viewId) => { const g = navGroups.find((x) => x.viewIds.includes(viewId)); return g ? g.label : 'الأقسام'; };
  const viewItems = views.map((v) => {
    const meta = navMeta(v);
    return {
      id: `view:${v.id}`, group: groupLabel(v.id), label: meta.title, meta: meta.code, icon: v.icon,
      keywords: [meta.title, v.title || '', meta.code, v.code || '', v.id],
      run: () => router.navigate(v.id),
    };
  });
  const has = (id) => Boolean(viewById(id));
  const actionItems = [
    has('airisks') ? { id: 'act:red-risks', label: 'عرض المخاطر الحمراء المفتوحة', meta: 'سجل المخاطر الذكي', icon: 'shield-alert', keywords: ['مخاطر حمراء', 'حرج', 'red risks'], run: () => router.navigate('airisks', { rating: 'red' }) } : null,
    has('tasks') ? { id: 'act:new-task', label: 'إضافة مهمة معالجة يدوية', meta: 'مهام المعالجة', icon: 'file-check', keywords: ['مهمه جديده', 'مهمة يدوية', 'new task'], run: () => router.navigate('tasks', { new: 1 }) } : null,
    has('alerts') ? { id: 'act:alerts', label: 'فتح قائمة التصعيد الفوري', meta: 'التنبيهات والتصعيد', icon: 'bell', keywords: ['تصعيد', 'تنبيهات', 'escalation'], run: () => router.navigate('alerts', { queue: 'immediate' }) } : null,
    has('risks') ? { id: 'act:new-risk', label: 'إضافة مخاطرة سلامة جديدة', meta: 'سجل المخاطر', icon: 'risk', keywords: ['اضافه مخاطره', 'خطر جديد', 'add risk'], run: () => router.navigate('risks', { new: 1 }) } : null,
    has('incidents') ? { id: 'act:new-incident', label: 'الإبلاغ عن حادث', meta: 'الحوادث', icon: 'incident', keywords: ['ابلاغ حادث', 'حادث وشيك', 'report incident'], run: () => router.navigate('incidents', { new: 1 }) } : null,
    { id: 'act:theme', label: 'تبديل السمة (داكن / فاتح)', meta: 'العرض', icon: 'theme', keywords: ['سمه', 'الوضع الليلي', 'theme dark light'], run: toggleTheme },
    { id: 'act:feed', label: () => (settings().feedPaused ? 'استئناف البث الحي' : 'إيقاف البث الحي'), meta: 'البث الحي', icon: 'feed', keywords: ['ايقاف البث', 'استئناف البث', 'pause feed'], run: toggleFeedPaused },
    { id: 'act:export', label: 'تصدير البيانات الكاملة JSON', meta: 'التقارير', icon: 'export', keywords: ['تصدير', 'json', 'export'], run: exportState },
    has('reports') ? { id: 'act:print', label: 'طباعة التقرير الشهري', meta: 'التقارير', icon: 'print', keywords: ['طباعه', 'pdf', 'print'], run: printReport } : null,
  ].filter(Boolean).map((a) => ({ ...a, group: 'الإجراءات' }));
  return [...viewItems, ...actionItems];
}

function exportState() {
  if (!canExport()) return;
  try {
    sources.exportJSON(store.state, `biltix-risk-ai-${new Date().toISOString().slice(0, 10)}.json`);
    toast('تم تصدير الحالة الكاملة للنظام بصيغة JSON.', { tone: 'good' });
  } catch (err) { reportError(err, 'exportJSON'); }
}

function printReport() {
  const cur = router.current ? router.current() : { id: null };
  if (cur.id !== 'reports') router.navigate('reports');
  setTimeout(() => { try { window.print(); } catch (err) { reportError(err, 'print'); } }, cur.id === 'reports' ? 50 : 700);
}

function dynamicCommands(query) {
  if (!query || normalizeText(query).length < 2) return [];
  const state = store.state || {};
  const out = [];
  // Part B (§B7): AI risks, contracts and mitigation tasks by code / title.
  if (viewById('airisks')) {
    platformList('aiRisks').forEach((r) => {
      const site = siteById(r.projectId);
      const score = bestScore(query, [r.code, r.title, r.driverExplanation || '', site ? site.name : '']);
      if (score > 0) {
        const rating = ratingOf(r.score);
        out.push({ id: `air:${r.id}`, group: 'المخاطر الذكية', label: r.title, meta: r.code, badge: { text: `${ratingLabel(rating)} · ${fmt.num(Math.round(Number(r.score) || 0))}`, tone: ratingTone(rating) }, icon: 'shield-alert', score,
          run: () => router.navigate('airisks', { risk: r.id }) });
      }
    });
  }
  if (viewById('contracts')) {
    platformList('contracts').forEach((c) => {
      const site = siteById(c.projectId);
      const score = bestScore(query, [c.code, c.title, c.counterparty || '', site ? site.name : '']);
      if (score > 0) {
        const rating = ratingOf(c.riskScore);
        out.push({ id: `ct:${c.id}`, group: 'العقود', label: `${c.title}${c.counterparty ? ` — ${c.counterparty}` : ''}`, meta: c.code, badge: { text: c.status || ratingLabel(rating), tone: ratingTone(rating) }, icon: 'file-text', score,
          run: () => router.navigate('contracts', { id: c.id }) });
      }
    });
  }
  if (viewById('tasks')) {
    platformList('tasks').forEach((t) => {
      const site = siteById(t.projectId);
      const score = bestScore(query, [t.code, t.title, t.owner || '', site ? site.name : '']);
      if (score > 0) {
        const tone = t.status === 'مغلقة' ? 'good' : t.status === 'متأخرة' ? 'critical' : t.status === 'قيد التنفيذ' ? 'accent' : 'neutral';
        out.push({ id: `mt:${t.id}`, group: 'مهام المعالجة', label: t.title, meta: t.code, badge: { text: t.status || '', tone }, icon: 'file-check', score,
          run: () => router.navigate('tasks', { id: t.id }) });
      }
    });
  }
  (state.risks || []).forEach((r) => {
    const site = siteById(r.siteId);
    const score = bestScore(query, [r.code, r.hazard, r.activity || '', site ? site.name : '']);
    if (score > 0) {
      let tier = ''; let tone = 'neutral';
      try { tier = sel.riskTier(sel.riskScore(r)); tone = sel.tierTone(tier); } catch { tier = ''; }
      out.push({ id: `risk:${r.id}`, group: 'المخاطر', label: r.hazard, meta: r.code, badge: tier ? { text: tier, tone } : null, icon: 'risk', score,
        run: () => { store.setFilter('search', r.code); router.navigate('risks', { q: r.code, id: r.id }); } });
    }
  });
  (state.permits || []).forEach((p) => {
    const site = siteById(p.siteId);
    const score = bestScore(query, [p.code, p.type, p.location || '', site ? site.name : '']);
    if (score > 0) {
      const tone = p.status === 'نشط' ? 'good' : p.status === 'معلق' ? 'warning' : p.status === 'بانتظار الاعتماد' ? 'accent' : 'neutral';
      out.push({ id: `permit:${p.id}`, group: 'تصاريح العمل', label: `${p.type} — ${p.location || ''}`, meta: p.code, badge: { text: p.status, tone }, icon: 'permit', score,
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
    list.appendChild(h('li', { class: 'cmdk-empty', role: 'option', 'aria-selected': 'false', id: 'cmdk-empty' }, emptyState({ icon: glyph('empty', 26), title: 'لا توجد نتائج مطابقة', text: 'جرّب رمزاً مثل AIR-1042 أو CT-2026-014 أو MT-0231 أو R-1001، أو اسم قسم أو إجراء.' })));
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
    if (item.badge) text.appendChild(badge(item.badge.text, item.badge.tone));
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
    const on = Number(li.dataset.index) === cmdk.active;
    li.classList.toggle('is-active', on);
    li.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on && scroll) li.scrollIntoView({ block: 'nearest' });
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
  const done = () => { cmdk.el.hidden = true; };
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

function buildContext() {
  return { store, bus, sel, fmt, charts, radar, components, art, live, sources, router, psel, platformLive };
}

function configureRouter(main) {
  const ctx = buildContext();
  const payload = { container: main, ctx, ...ctx };
  for (const name of ['configure', 'init', 'setContext', 'mount']) {
    if (typeof router[name] === 'function') {
      try { router[name](payload); } catch (err) { reportError(err, `router.${name}`); }
      return true;
    }
  }
  return false;
}

let lastNumerals = null;

function handleSettingsChange(payload) {
  const s = (payload && payload.settings) || settings();
  applySettings(s);
  const numerals = s.numerals === 'arab' ? 'arab' : 'latn';
  if (lastNumerals !== null && numerals !== lastNumerals) {
    refreshRangeLabels(); renderFeedList(); refreshIntegrationsPill(); refreshScorePill(); updateBell(); tickClock();
    const cur = router.current ? router.current() : null;
    if (cur && cur.id) {
      try { router.navigate(cur.id, cur.params || {}); } catch (err) { reportError(err, 'router.navigate'); }
    }
  }
  lastNumerals = numerals;
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
    title: 'جارٍ تجهيز أقسام المنصة…',
    text: 'لم تُحمَّل أي وحدة عرض بعد. يبقى الهيكل والبث الحي والتنبيهات في الخدمة، وستظهر الأقسام فور توفر وحداتها.',
  })));
}

function syncDocumentTitle(view) {
  const title = view && view.title ? `${view.title} — ${APP_TITLE}` : `${APP_TITLE} — منصة إدارة المخاطر بالذكاء الاصطناعي`;
  if (document.title !== title) document.title = title;
}

async function boot() {
  const main = $('main');
  document.body.classList.add('is-booting');
  trackInputModality();
  installVisibilityManager();

  // Views are NOT imported here: the static registry drives the rail / tab bar / palette and the
  // router imports each module on first navigation (hover / focus prefetch warms it up).
  await loadOptionalModules();
  views = navViews.filter((v) => v && typeof v.id === 'string' && (typeof v.load === 'function' || typeof v.render === 'function'));

  applySettings();
  lastNumerals = settings().numerals === 'arab' ? 'arab' : 'latn';
  mountBackdrop();
  buildRail();
  buildTabbar();
  buildFilters();
  buildFeed();
  startClock();
  buildIntegrationsPill();
  buildScorePill();
  buildNotifications();
  buildToggles();
  buildCommandPalette();

  views.forEach((view) => { try { router.register(view); } catch (err) { reportError(err, `router.register(${view && view.id})`); } });
  configureRouter(main);

  // Before the view changes: close menus, drawers, the "المزيد" sheet and the palette.
  on('ui:route-leave', (payload) => {
    closeTransientUi();
    if (payload && payload.to) markActive(payload.to);
  });
  on('route:change', (payload) => {
    const id = payload && payload.id;
    markActive(id);
    syncDocumentTitle((payload && payload.view) || viewById(id));
    if (narrowQuery().matches) setFeedOpen(false);
    setRailOpen(false);
    closeTransientUi();
    if (main) main.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
  on('settings:change', handleSettingsChange);
  on('theme:change', () => applySettings());

  if (views.length) {
    router.start(homeViewId());
    const cur = router.current ? router.current() : null;
    if (cur && cur.id) { markActive(cur.id); syncDocumentTitle(viewById(cur.id)); }
  } else {
    renderShellEmpty(main);
    syncDocumentTitle(null);
  }

  if (live && typeof live.start === 'function') {
    try { live.start({ store, bus }); } catch (err) { reportError(err, 'live.start'); }
  }
  if (platformLive && typeof platformLive.start === 'function') {
    try { platformLive.start({ store, bus }); } catch (err) { reportError(err, 'platformLive.start'); }
  }

  // `views` = the registered entries (static metas; `loaded`/`render` appear once a module is imported).
  window.biltix = Object.freeze({ store, bus, router, live, sel, fmt, psel, platformLive, ready: true, views: Object.freeze(views.slice()), missingModules: Object.freeze(missingModules.slice()) });
  document.body.classList.remove('is-booting');
  document.body.classList.add('is-ready');
}

boot().catch((err) => reportError(err, 'boot'));
