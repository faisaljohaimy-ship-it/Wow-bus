/**
 * Offline status panel (Settings SET-08 "Offline" and #/fieldkit). Honest facts only: network state from
 * navigator.onLine (+ the field kit's simulated outage), the service worker's real state, the number of files in
 * this app's caches, navigator.storage.estimate(), the persistence grant, and the outbox count. Actions: request
 * persistent storage, clear the offline copy (caches + service worker; data and outbox untouched).
 *
 *   offlinePanel(ctx, { compact }) → { el, refresh(), destroy() }
 */
import { components } from '../../ui/components.js';
import { i18n, t, tn } from '../../core/i18n.js';
import dict from '../../i18n/fieldkit.js';
import * as off from '../../core/offline.js';

i18n.register('fieldkit', dict);

const { h, clear, button, toast, statusBadge, badge } = components;

export function dictList(path) {
  const src = i18n.lang() === 'en' ? dict.en : dict.ar;
  const v = path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), src);
  return Array.isArray(v) ? v.map(String) : [];
}

export function swLabel(info) {
  if (info.state === 'skipped') return t(`fieldkit.sw.skipped.${info.reason || 'unsupported'}`);
  return t(`fieldkit.sw.${['ready', 'installing', 'registering', 'idle', 'error', 'cleared'].includes(info.state) ? info.state : 'idle'}`);
}

export function offlinePanel(ctx = {}, { compact = false } = {}) {
  const fmt = ctx.fmt;
  const bus = ctx.bus;
  const router = ctx.router;
  let alive = true;
  const num = (n) => (fmt && typeof fmt.num === 'function' ? fmt.num(n) : String(n));
  const size = (bytes) => {
    if (!Number.isFinite(bytes)) return '—';
    const mb = bytes / (1024 * 1024);
    const v = mb >= 1024 ? `${num(Math.round(mb / 102.4) / 10)} GB` : (mb >= 1 ? `${num(Math.round(mb * 10) / 10)} MB` : `${num(Math.round(bytes / 1024))} KB`);
    return `\u2066${v}\u2069`; // one LTR run per number + unit inside Arabic text
  };

  const netHost = h('dd');
  const swHost = h('dd');
  const usedHost = h('dd');
  const persistHost = h('dd');
  const outboxHost = h('dd');
  const facts = h('dl', { class: 'fk-facts' },
    h('div', { class: 'fk-fact' }, h('dt', {}, t('fieldkit.conn.network')), netHost),
    h('div', { class: 'fk-fact' }, h('dt', {}, t('fieldkit.settings.copy')), swHost),
    h('div', { class: 'fk-fact' }, h('dt', {}, t('fieldkit.settings.used')), usedHost),
    h('div', { class: 'fk-fact' }, h('dt', {}, t('fieldkit.settings.persist')), persistHost),
    h('div', { class: 'fk-fact' }, h('dt', {}, t('fieldkit.outbox.title')), outboxHost));

  const persistBtn = button(t('fieldkit.settings.requestPersist'), {
    variant: 'outline', size: 'sm', icon: 'lock',
    onClick: async () => {
      const ok = await off.requestPersistence();
      toast(t(ok ? 'fieldkit.settings.persistGranted' : 'fieldkit.settings.persistDenied'), { tone: ok ? 'good' : 'warning' });
      refresh();
    },
  });
  const clearBtn = button(t('fieldkit.settings.clear'), {
    variant: 'ghost', size: 'sm', icon: 'trash',
    onClick: async () => {
      if (typeof confirm === 'function' && !confirm(t('fieldkit.settings.clearConfirm'))) return;
      const n = await off.clearOfflineCache();
      toast(tn('fieldkit.settings.cleared', n), { tone: 'neutral' });
      refresh();
    },
  });
  const actions = h('div', { class: 'fk-actions' }, persistBtn, clearBtn);
  if (!compact && router && typeof router.navigate === 'function') actions.appendChild(button(t('fieldkit.settings.openFieldkit'), { variant: 'ghost', size: 'sm', icon: 'map-pin', onClick: () => router.navigate('fieldkit') }));

  const el = h('div', { class: 'fk-panel stack gap-4' }, facts, actions);
  if (!compact) {
    el.appendChild(h('div', { class: 'fk-note' },
      h('strong', { class: 'text-sm' }, t('fieldkit.settings.iosTitle')),
      h('ul', { class: 'fk-list' }, ...dictList('settings.ios').map((s) => h('li', {}, s)))));
  }

  async function refresh() {
    if (!alive) return;
    const online = off.isOnline();
    clear(netHost);
    netHost.appendChild(online ? badge(t('fieldkit.net.online'), 'good') : statusBadge('offline', { label: t(off.isSimulatedOffline() ? 'fieldkit.net.offlineSimShort' : 'fieldkit.net.offlineShort'), size: 'sm' }));
    const box = off.outbox();
    const waiting = box ? box.count() : 0;
    outboxHost.textContent = tn('fieldkit.net.waitingSentence', waiting);
    const [cache, store] = await Promise.all([off.cacheInfo(), off.storageInfo()]);
    if (!alive) return;
    const sw = off.swInfo();
    swHost.textContent = cache.files ? `${swLabel(sw)} · ${tn('fieldkit.settings.files', cache.files)}` : swLabel(sw);
    usedHost.textContent = store.usage != null && store.quota ? t('fieldkit.settings.usedValue', { used: size(store.usage), quota: size(store.quota) }) : t('fieldkit.settings.unknown');
    persistHost.textContent = store.persisted == null ? t('fieldkit.settings.unknown') : t(store.persisted ? 'fieldkit.settings.persisted' : 'fieldkit.settings.notPersisted');
    persistBtn.hidden = !store.canPersist || store.persisted === true;
  }

  const unsubs = [];
  if (bus && typeof bus.on === 'function') ['field:network', 'field:sw', 'field:outbox'].forEach((ev) => unsubs.push(bus.on(ev, refresh)));
  const onNet = () => refresh();
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);
  refresh();

  return {
    el,
    refresh,
    destroy() {
      alive = false;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    },
  };
}

export default offlinePanel;
