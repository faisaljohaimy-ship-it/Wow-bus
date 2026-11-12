/**
 * BILTIX Risk AI — connector details drawer (js/views/shared/connector-details.js). Owner: #/golive (PLT-04).
 * Used by #/integrations (a "Details" / "Test connection" drawer per card) and #/golive (the integrations map).
 *
 *   openConnectorDetails(ctx, { entry, records, returnFocus, realTest, autoTest }) → drawer api
 *     entry    a CONNECTORS item from js/data/golive.js (the plan §2 row)
 *     records  [{ name, status }] — the demo records it describes, with their honest status (status.js)
 *     realTest optional () => void — only for sources a browser can genuinely test over HTTP (json / sheets /
 *              supabase / webhook); it opens the existing set-up dialog that sends one real request.
 *     autoTest true → show the honest test result as soon as the drawer opens (the card's "Test connection").
 *
 * "Test connection" never fakes a result: without `realTest` it explains that the connector needs the client's
 * credentials and a backend that keeps them server-side, and says that nothing was sent.
 * Copy: dictionary 'golive' (conn.<key>.*, drawer.*). Data reaches the DOM only via textContent / h().
 */

import { i18n } from '../../core/i18n.js';
import dict from '../../i18n/golive.js';
import { connectorClass } from '../../data/golive.js';

i18n.register('golive', dict);

const t = (k, p) => i18n.t(`golive.${k}`, p);
const has = (k) => i18n.has(`golive.${k}`);

/** Free text → the active numeral system; Latin alphanumeric tokens (P6, CT2-O1, 802.3af) keep ASCII digits. */
const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._/-]*\d[A-Za-z0-9._/-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
export function digitsIn(fmt, value) {
  const s = String(value ?? '');
  if (!fmt || typeof fmt.digits !== 'function' || !/\d/.test(s)) return s;
  let out = ''; let last = 0; let m;
  LATIN_NUM_TOKEN.lastIndex = 0;
  while ((m = LATIN_NUM_TOKEN.exec(s))) { out += fmt.digits(s.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + fmt.digits(s.slice(last));
}

/** A connector field from the dictionary ('' when the plan row has none). */
export function connText(key, field) {
  return has(`conn.${key}.${field}`) ? t(`conn.${key}.${field}`) : '';
}

/** Go-live class pill (.gl-pill.is-<class>): a dot, the label, the meaning as a tooltip. */
export function glPill(h, cls, { compact = false } = {}) {
  return h('span', { class: ['gl-pill', `is-${cls}`, compact ? 'is-compact' : null], title: t(`statusHint.${cls}`) },
    h('span', { class: 'gl-pill-dot', 'aria-hidden': 'true' }), h('span', {}, t(`status.${cls}`)));
}

/** Effort code with the "(est.)" mark, e.g. "M (est.)". */
export function effortText(entry) {
  if (!entry || !entry.effort) return t('effort.none');
  return `${entry.effort} (${i18n.t('golive.roadmap.est')})`;
}

export function waveLabel(entry) {
  if (!entry) return '';
  if (entry.wave === 1) return t('drawer.wave1', { n: entry.chain || 1 });
  return t(entry.wave === 2 ? 'drawer.wave2' : 'drawer.wave3');
}

export function openConnectorDetails(ctx, { entry, records = [], returnFocus = null, realTest = null, autoTest = false } = {}) {
  const { components, fmt, router } = ctx;
  const { h, drawer, statusBadge, button, glyph, svgIcon } = components;
  const D = (s) => digitsIn(fmt, s);
  if (!entry) return null;
  const key = entry.key;
  const cls = connectorClass(entry);
  const name = connText(key, 'name') || key;

  const fact = (label, value, { wide = false } = {}) => (value
    ? h('div', { class: ['gl-fact', wide ? 'is-wide' : null] }, h('dt', {}, label), h('dd', {}, D(value)))
    : null);

  const demoRows = records.length
    ? records.map((r) => h('li', { class: 'gl-rec' }, statusBadge(r.status, { size: 'sm' }), h('span', { class: 'gl-rec-name' }, D(r.name)),
      r.status === 'demo' ? h('span', { class: 'sim-tag' }, svgIcon('flask', 11), t('drawer.simulated')) : null))
    : [h('li', { class: 'gl-rec' }, statusBadge('not_connected', { size: 'sm' }), h('span', { class: 'gl-rec-name' }, t('drawer.missingRec')))];

  const wave1 = entry.wave === 1;
  const purpose = connText(key, 'purpose');
  const entities = connText(key, 'entities');
  const authText = connText(key, 'auth') || t('drawer.authDefault');
  const effortNote = connText(key, 'effortNote');

  const result = h('div', { class: 'gl-test-result', 'aria-live': 'polite' });
  function runHonestTest() {
    result.replaceChildren(h('div', { class: 'note', role: 'status', style: { '--tone': 'var(--line-strong)' } },
      h('p', { class: 'gl-test-line' }, glyph('neutral', 14), h('strong', {}, t('drawer.testNotRun'))),
      h('p', { class: 'gl-test-line' }, D(t('drawer.testWhy', { auth: authText }))),
      h('p', { class: 'gl-test-line muted' }, t('drawer.testNext'))));
  }
  let api = null;
  const testBtn = realTest
    ? button(t('drawer.testReal'), { variant: 'outline', size: 'sm', icon: 'plug', onClick: () => { if (api) api.close('action'); realTest(); } })
    : button(t('drawer.test'), { variant: 'outline', size: 'sm', icon: 'plug', onClick: runHonestTest });

  const body = h('div', { class: 'gl-drawer-body' },
    h('div', { class: 'gl-drawer-status' },
      h('div', { class: 'gl-drawer-col' }, h('span', { class: 'gl-k' }, t('drawer.goLive')), glPill(h, cls)),
      h('div', { class: 'gl-drawer-col' }, h('span', { class: 'gl-k' }, t('drawer.inDemo')), h('ul', { class: 'gl-recs' }, ...demoRows))),
    h('dl', { class: 'gl-facts' },
      fact(t('drawer.systems'), connText(key, 'systems'), { wide: true }),
      fact(wave1 ? t('drawer.purpose') : t('drawer.purposeEntities'), purpose, { wide: true }),
      fact(t('drawer.protocol'), connText(key, 'protocol'), { wide: true }),
      fact(t('drawer.direction'), t(`dir.${entry.dir || 'none'}`)),
      fact(t('drawer.frequency'), connText(key, 'freq')),
      fact(t('drawer.effort'), [effortText(entry), effortNote].filter(Boolean).join(' — ')),
      fact(t('drawer.entities'), entities, { wide: true }),
      fact(t('drawer.auth'), authText, { wide: true }),
      wave1 ? fact(t('drawer.prereq'), connText(key, 'prereq'), { wide: true }) : fact(t('drawer.prereqRisks'), connText(key, 'notes'), { wide: true }),
      fact(t('drawer.risks'), connText(key, 'risks'), { wide: true })),
    h('p', { class: 't-helper gl-scale' }, D(t('effort.scale'))),
    h('section', { class: 'gl-test', 'aria-label': t('drawer.testTitle') },
      h('h3', { class: 'gl-test-title' }, t('drawer.testTitle')),
      realTest ? h('p', { class: 't-helper' }, t('drawer.testRealHint')) : null,
      h('div', {}, testBtn),
      result),
    h('p', { class: 't-helper' }, D(t('drawer.source'))));

  const onGolive = typeof location !== 'undefined' && /^#\/golive/.test(location.hash || '');
  api = drawer({
    title: name,
    subtitle: t('drawer.sub', { wave: waveLabel(entry) }),
    body,
    size: 'md',
    returnFocus,
    className: 'gl-drawer',
    actions: [
      onGolive ? null : { label: t('drawer.openGolive'), variant: 'ghost', icon: 'send', onClick: () => { if (router && typeof router.navigate === 'function') router.navigate('golive', { section: 'map' }); else location.hash = '#/golive?section=map'; } },
      { label: t('drawer.close'), variant: 'outline' },
    ].filter(Boolean),
  });
  api.open();
  if (autoTest && !realTest) runHonestTest();
  return api;
}
