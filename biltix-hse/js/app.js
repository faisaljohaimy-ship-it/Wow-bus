/**
 * Biltix HSE — application bootstrap (app shell wiring).
 *
 * Order of work (docs/ARCHITECTURE.md §9, §12):
 *   settings → art mount → rail / tab bar → filters → feed → clock → integrations pill →
 *   notifications (bell, banner) → theme & rail toggles → command palette → views → live engine.
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
import { charts } from './ui/charts.js';
import * as radar from './ui/radar.js';
import { art } from './ui/art.js';
import { live } from './data/live.js';
import { sources } from './data/sources.js';
import { views } from './views/index.js';

const { h, clear, glyph, badge, button, toast, drawer, segmented, liveDot, emptyState } = components;

const STORAGE_KEY = 'biltix-hse:v1';
const APP_VERSION = '1.0.0';
const RIYADH_TZ = 'Asia/Riyadh';
const FEED_CAP = 200;
const ALERT_CAP = 30;
const BANNER_MS = 12000;
const TONES = ['neutral', 'good', 'warning', 'serious', 'critical', 'brand', 'accent'];
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const toneOf = (t) => (TONES.includes(t) ? t : 'neutral');
const reducedMotion = () => components.reducedMotion();

function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
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
  console.error(context ? `[بلتكس HSE] ${context}:` : '[بلتكس HSE]', err);
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
  if (HEX_RE.test(brand.primary || '')) root.style.setProperty('--brand', brand.primary); else root.style.removeProperty('--brand');
  if (HEX_RE.test(brand.accent || '')) root.style.setProperty('--accent', brand.accent); else root.style.removeProperty('--accent');

  const numerals = s.numerals === 'arab' ? 'arab' : 'latn';
  root.setAttribute('data-numerals', numerals);
  if (numerals !== appliedNumerals) {
    appliedNumerals = numerals;
    try { fmt.setNumerals(numerals); } catch (err) { reportError(err, 'fmt.setNumerals'); }
    rebuildClockFormatters(numerals);
  }

  if (s.reducedMotion) root.setAttribute('data-motion', 'reduced'); else root.removeAttribute('data-motion');
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
  if (name) name.textContent = `${company} HSE`;
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
  try { node = typeof art.logoMark === 'function' ? art.logoMark(36) : null; } catch (err) { reportError(err, 'art.logoMark'); }
  if (node instanceof Node) target.appendChild(node);
  else target.appendChild(glyph('brand', 36));
}

function mountBackdrop() {
  const host = $('backdrop');
  if (!host) return;
  let node = null;
  try { node = typeof art.backdrop === 'function' ? art.backdrop() : null; } catch (err) { reportError(err, 'art.backdrop'); }
  if (node instanceof Node) { clear(host); host.appendChild(node); }
}

/* ------------------------------------------------------------------ */
/* Navigation rail & bottom tab bar                                    */
/* ------------------------------------------------------------------ */

const railButtons = new Map();
const tabButtons = new Map();
let moreDrawer = null;

function navItem(view, { compact = false } = {}) {
  const btn = h('button', {
    type: 'button', class: compact ? 'tab-item' : 'rail-item', 'data-view': view.id,
    title: compact ? undefined : view.title, onClick: () => router.navigate(view.id),
  });
  btn.appendChild(h('span', { class: compact ? 'tab-icon' : 'rail-icon', 'aria-hidden': 'true' }, iconFor(view.icon, compact ? 22 : 20)));
  btn.appendChild(h('span', { class: compact ? 'tab-label' : 'rail-label' }, view.title));
  if (!compact) btn.appendChild(h('span', { class: 'rail-code mono', 'aria-hidden': 'true' }, view.code || ''));
  return btn;
}

function buildRail() {
  const list = $('railList');
  if (!list) return;
  clear(list);
  views.forEach((view) => {
    const li = h('li', { class: 'rail-li' });
    const btn = navItem(view);
    railButtons.set(view.id, btn);
    li.appendChild(btn);
    list.appendChild(li);
  });
  const version = $('railVersion');
  if (version) version.textContent = `v${APP_VERSION}`;
}

function buildTabbar() {
  const bar = $('tabbar');
  if (!bar) return;
  clear(bar);
  tabButtons.clear();
  const primary = views.slice(0, 5);
  const rest = views.slice(5);
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
  rest.forEach((view) => {
    const b = h('button', {
      type: 'button', class: ['sheet-item', current.id === view.id ? 'is-active' : null], 'aria-current': current.id === view.id ? 'page' : undefined,
      onClick: () => { moreDrawer.close(); router.navigate(view.id); },
    });
    b.appendChild(h('span', { class: 'sheet-icon', 'aria-hidden': 'true' }, iconFor(view.icon, 20)));
    b.appendChild(h('span', { class: 'sheet-label' }, view.title));
    b.appendChild(h('span', { class: 'sheet-code mono', 'aria-hidden': 'true' }, view.code || ''));
    list.appendChild(h('li', {}, b));
  });
  anchor.setAttribute('aria-expanded', 'true');
  moreDrawer = drawer({ title: 'المزيد من الأقسام', subtitle: 'جميع أقسام مركز القيادة', body: list, onClose: () => anchor.setAttribute('aria-expanded', 'false') });
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
  return `${n} يومًا`;
}

function buildFilters() {
  const site = $('siteSelect');
  if (site) {
    clear(site);
    site.appendChild(h('option', { value: 'all' }, 'جميع المواقع'));
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
  if (status) status.textContent = paused ? 'البث متوقف مؤقتًا — القراءات الحية مستمرة' : 'متصل بالأنظمة الحية';
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
  training: 'training', integration: 'integration', ppe: 'ppe', weather: 'weather', alert: 'alert',
};
const FEED_TYPE_LABELS = {
  sensor: 'حسّاس', permit: 'تصريح عمل', incident: 'حادث', nearmiss: 'حادث وشيك', inspection: 'تفتيش',
  training: 'تدريب', integration: 'تكامل', ppe: 'معدات الوقاية', weather: 'طقس', alert: 'تنبيه',
};
const feedTimes = new Set();

function feedItem(ev, { fresh = false } = {}) {
  const tone = toneOf(ev.tone || 'neutral');
  const type = FEED_ICONS[ev.type] ? ev.type : 'alert';
  const li = h('li', { class: ['feed-item', `tone-${tone}`, `type-${type}`, fresh ? 'is-new' : null], 'data-id': ev.id || undefined, 'data-type': type });
  li.appendChild(h('span', { class: ['feed-tone', `tone-${tone}`], 'aria-hidden': 'true' }));
  li.appendChild(h('span', { class: 'feed-icon', 'aria-hidden': 'true' }, iconFor(FEED_ICONS[type], 16, tone)));
  const body = h('div', { class: 'feed-body' });
  const row = h('div', { class: 'feed-title-row' });
  row.appendChild(h('strong', { class: 'feed-title' }, String(ev.title || FEED_TYPE_LABELS[type])));
  const time = h('time', { class: 'feed-time mono', datetime: ev.ts || '' }, safeRelative(ev.ts));
  time.dataset.ts = ev.ts || '';
  feedTimes.add(time);
  row.appendChild(time);
  body.appendChild(row);
  if (ev.detail) body.appendChild(h('p', { class: 'feed-detail' }, String(ev.detail)));
  const meta = h('div', { class: 'feed-meta' });
  meta.appendChild(h('span', { class: 'feed-type' }, FEED_TYPE_LABELS[type]));
  const site = siteById(ev.siteId);
  if (site) meta.appendChild(h('span', { class: 'feed-site' }, site.name));
  if (ev.sourceId) {
    const integ = ((store.state && store.state.integrations) || []).find((i) => i.id === ev.sourceId);
    if (integ) meta.appendChild(h('span', { class: 'feed-source' }, integ.name));
  }
  body.appendChild(meta);
  li.appendChild(body);
  li.setAttribute('aria-label', `${FEED_TYPE_LABELS[type]}: ${ev.title || ''}`);
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
  const count = $('feedCount');
  const list = $('feedList');
  if (count && list) count.textContent = fmt.num(list.children.length);
}

function buildFeed() {
  const list = $('feedList');
  if (!list) return;
  clear(list);
  const existing = ((store.state && store.state.feed) || []).slice(0, FEED_CAP);
  const frag = document.createDocumentFragment();
  existing.forEach((ev) => frag.appendChild(feedItem(ev)));
  list.appendChild(frag);
  if (!existing.length) list.appendChild(h('li', { class: 'feed-empty' }, emptyState({ icon: glyph('accent', 28), title: 'بانتظار أول حدث من الأنظمة المتصلة', text: 'يبدأ البث الحي تلقائيًا خلال ثوانٍ.' })));
  updateFeedCount();

  on('feed:event', (ev) => {
    if (!ev || typeof ev !== 'object') return;
    const empty = list.querySelector('.feed-empty');
    if (empty) empty.remove();
    list.insertBefore(feedItem(ev, { fresh: true }), list.firstChild);
    while (list.children.length > FEED_CAP) list.lastChild.remove();
    pruneFeedTimes();
    updateFeedCount();
  });

  setInterval(refreshFeedTimes, 30000);

  const all = $('feedAll');
  if (all) all.addEventListener('click', openFeedArchive);
}

function openFeedArchive() {
  const items = ((store.state && store.state.feed) || []).slice(0, FEED_CAP);
  const list = h('ul', { class: 'feed-list is-archive', role: 'list' });
  if (!items.length) list.appendChild(h('li', {}, emptyState({ title: 'لا توجد أحداث بعد' })));
  items.forEach((ev) => list.appendChild(feedItem(ev)));
  const d = drawer({
    title: 'سجل البث الحي', subtitle: `آخر ${fmt.num(items.length)} حدثًا من الأنظمة المتصلة`, body: list, size: 'lg',
    actions: [{ label: 'تصدير JSON', variant: 'outline', closes: false, onClick: () => exportFeed(items) }, { label: 'إغلاق', variant: 'ghost' }],
    onClose: pruneFeedTimes,
  });
  d.open();
}

function exportFeed(items) {
  try { sources.exportJSON({ exportedAt: new Date().toISOString(), count: items.length, feed: items }, 'biltix-hse-feed.json'); toast('تم تصدير سجل البث بصيغة JSON.', { tone: 'good' }); }
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
  setInterval(tickClock, 1000);
}

/* ------------------------------------------------------------------ */
/* Integrations pill                                                   */
/* ------------------------------------------------------------------ */

function refreshIntegrationsPill() {
  const pill = $('integrationsPill');
  const count = $('integrationsCount');
  if (!pill || !count) return;
  const list = (store.state && store.state.integrations) || [];
  const connected = list.filter((i) => i.status === 'connected').length;
  const degraded = list.filter((i) => i.status === 'degraded').length;
  const down = list.filter((i) => i.status === 'disconnected').length;
  count.textContent = `${fmt.num(connected)}/${fmt.num(list.length)}`;
  const tone = down > 0 ? 'serious' : degraded > 0 ? 'warning' : 'good';
  pill.dataset.tone = tone;
  const dot = pill.querySelector('.live-dot');
  if (dot) { TONES.forEach((t) => dot.classList.remove(`tone-${t}`)); dot.classList.add(`tone-${tone === 'good' ? 'accent' : tone}`); }
  const parts = [`${fmt.num(connected)} من ${fmt.num(list.length)} تكاملًا متصلًا`];
  if (degraded) parts.push(`${fmt.num(degraded)} متدهور`);
  if (down) parts.push(`${fmt.num(down)} منقطع`);
  pill.setAttribute('aria-label', `حالة التكاملات: ${parts.join('، ')}`);
  pill.title = parts.join(' · ');
}

function buildIntegrationsPill() {
  const pill = $('integrationsPill');
  if (pill) pill.addEventListener('click', () => router.navigate('integrations'));
  refreshIntegrationsPill();
  on('integrations:tick', refreshIntegrationsPill);
  on('store:change', (p) => { if (!p || !p.path || String(p.path).startsWith('integrations')) refreshIntegrationsPill(); });
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
  body.appendChild(h('strong', { class: 'alert-item-title' }, String(a.title || 'تنبيه')));
  if (a.detail) body.appendChild(h('p', { class: 'alert-item-detail' }, String(a.detail)));
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
  if (!alerts.length) list.appendChild(h('li', {}, emptyState({ icon: glyph('good', 30), title: 'لا توجد تنبيهات', text: 'ستظهر هنا التنبيهات الحرجة والتحذيرات الواردة من الحسّاسات والأنظمة المتصلة.' })));
  alerts.forEach((a) => list.appendChild(alertRow(a)));
  bellDrawer = drawer({
    title: 'التنبيهات', subtitle: `آخر ${fmt.num(alerts.length)} تنبيهًا`, body: list,
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
  text.appendChild(h('strong', { class: 'alert-banner-title' }, String(a.title || 'تنبيه حرج')));
  const detailParts = [];
  if (a.detail) detailParts.push(String(a.detail));
  const site = siteById(a.siteId);
  if (site) detailParts.push(site.name);
  if (detailParts.length) text.appendChild(h('span', { class: 'alert-banner-detail' }, detailParts.join(' — ')));
  banner.appendChild(text);
  const actions = h('div', { class: 'alert-banner-actions' });
  actions.appendChild(button('فتح الرادار', { variant: 'outline', size: 'sm', onClick: () => { hideBanner(); router.navigate('radar', a.siteId ? { site: a.siteId } : {}); } }));
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
    toast(msg || a.title || 'تنبيه جديد', { tone: a.tone, title: msg ? a.title : '', timeout: a.tone === 'critical' ? 9000 : 5500, action: { label: 'عرض', onClick: openBellDrawer } });
    if (a.tone === 'critical') showBanner(a);
  });
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
  toast(paused ? 'تم إيقاف البث الحي مؤقتًا. القراءات الحية مستمرة في الخلفية.' : 'تم استئناف البث الحي.', { tone: paused ? 'warning' : 'good', timeout: 2600 });
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
  const viewItems = views.map((v) => ({
    id: `view:${v.id}`, group: 'الأقسام', label: v.title, meta: v.code || '', icon: v.icon, keywords: [v.title, v.code || '', v.id],
    run: () => router.navigate(v.id),
  }));
  const actionItems = [
    { id: 'act:new-risk', label: 'إضافة مخاطرة جديدة', meta: 'سجل المخاطر', icon: 'risk', keywords: ['اضافه مخاطره', 'خطر جديد', 'add risk'], run: () => router.navigate('risks', { new: 1 }) },
    { id: 'act:new-incident', label: 'الإبلاغ عن حادث', meta: 'الحوادث', icon: 'incident', keywords: ['ابلاغ حادث', 'حادث وشيك', 'report incident'], run: () => router.navigate('incidents', { new: 1 }) },
    { id: 'act:theme', label: 'تبديل السمة (داكن / فاتح)', meta: 'العرض', icon: 'theme', keywords: ['سمه', 'الوضع الليلي', 'theme dark light'], run: toggleTheme },
    { id: 'act:feed', label: () => (settings().feedPaused ? 'استئناف البث الحي' : 'إيقاف البث الحي'), meta: 'البث الحي', icon: 'feed', keywords: ['ايقاف البث', 'استئناف البث', 'pause feed'], run: toggleFeedPaused },
    { id: 'act:export', label: 'تصدير البيانات الكاملة JSON', meta: 'التقارير', icon: 'export', keywords: ['تصدير', 'json', 'export'], run: exportState },
    { id: 'act:print', label: 'طباعة تقرير السلامة الشهري', meta: 'التقارير', icon: 'print', keywords: ['طباعه', 'pdf', 'print'], run: printReport },
  ].map((a) => ({ ...a, group: 'الإجراءات' }));
  return [...viewItems, ...actionItems];
}

function exportState() {
  try {
    sources.exportJSON(store.state, `biltix-hse-${new Date().toISOString().slice(0, 10)}.json`);
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
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
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
    list.appendChild(h('li', { class: 'cmdk-empty', role: 'option', 'aria-selected': 'false', id: 'cmdk-empty' }, emptyState({ icon: glyph('empty', 26), title: 'لا توجد نتائج مطابقة', text: 'جرّب رمزًا مثل R-1001 أو PTW-5521، أو اسم قسم أو إجراء.' })));
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
  if (cmdk.previous && typeof cmdk.previous.focus === 'function' && document.contains(cmdk.previous)) cmdk.previous.focus();
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
  return { store, bus, sel, fmt, charts, radar, components, art, live, sources, router };
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
    refreshRangeLabels(); refreshFeedTimes(); updateFeedCount(); refreshIntegrationsPill(); updateBell(); tickClock();
    const cur = router.current ? router.current() : null;
    if (cur && cur.id) {
      try { router.navigate(cur.id, cur.params || {}); } catch (err) { reportError(err, 'router.navigate'); }
    }
  }
  lastNumerals = numerals;
}

function boot() {
  const main = $('main');
  applySettings();
  lastNumerals = settings().numerals === 'arab' ? 'arab' : 'latn';
  mountBackdrop();
  buildRail();
  buildTabbar();
  buildFilters();
  buildFeed();
  startClock();
  buildIntegrationsPill();
  buildNotifications();
  buildToggles();
  buildCommandPalette();

  views.forEach((view) => { try { router.register(view); } catch (err) { reportError(err, `router.register(${view && view.id})`); } });
  configureRouter(main);

  on('route:change', (payload) => {
    const id = payload && payload.id;
    markActive(id);
    if (narrowQuery().matches) setFeedOpen(false);
    setRailOpen(false);
    if (cmdk.open) closeCmdk();
    if (moreDrawer && moreDrawer.isOpen()) moreDrawer.close();
    if (main) main.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
  on('settings:change', handleSettingsChange);
  on('theme:change', () => applySettings());

  router.start('overview');
  const cur = router.current ? router.current() : null;
  if (cur && cur.id) markActive(cur.id);

  try { live.start({ store, bus }); } catch (err) { reportError(err, 'live.start'); }

  window.biltix = Object.freeze({ store, bus, router, live, sel, fmt });
  document.body.classList.add('is-ready');
}

try { boot(); } catch (err) { reportError(err, 'boot'); }
