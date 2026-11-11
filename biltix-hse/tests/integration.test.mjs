/**
 * v3.8 integration: the pieces built separately (go-live page, field kit, worked example + 360°, the paint-first
 * loader, the English default) agree with each other.
 *   - every route is registered, listed and labelled once; tools/qa.mjs and AGENTS.md follow the registry
 *   - index.html's loader preloads exactly the boot graph and the home route's own modules
 *   - the worked example's entry points (field kit crate, 360° hotspots, go-live rows, walkthrough) reach real records
 *   - the go-live page describes what the demo has today; the QR points on the plan are the field kit's labels
 *   - new controls keep "label in name"; actors written by the field kit have an English mirror
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, freshStore, psel, store, bus } from './helpers.mjs';
import { core } from '../js/i18n/core.js';
import { NAV_META, VIEW_ORDER, TAB_IDS, navGroups, views } from '../js/views/index.js';
import { labelInName, nameContains, nameExtra } from '../js/ui/components.js';
import * as SP from '../js/data/spatial-seed.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const html = read('index.html');

/** Static (import … from / export … from / bare import) graph of a module, as paths relative to the app root. */
function staticGraph(entry, seen = new Set()) {
  const abs = resolve(root, entry);
  const rel = relative(root, abs).split('\\').join('/');
  if (seen.has(rel)) return seen;
  seen.add(rel);
  const src = readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /(?:^|\n)\s*(?:import|export)\s[^'"`;]*?from\s*['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) staticGraph(relative(root, join(dirname(abs), m[1] || m[2])), seen);
  return seen;
}
const listIn = (name) => {
  const m = new RegExp(`${name} = (?:\\{ cockpit: )?\\[([^\\]]*)\\]`).exec(html);
  assert.ok(m, `${name} list in index.html`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (w, k) => (p[k] === undefined ? w : String(p[k])));

export const tests = [
  {
    name: 'routes: 25 views, each once in the registry, the rail order and the dictionaries (ar + en); tab bar ids exist',
    fn() {
      const ids = NAV_META.map((m) => m.id);
      assert.equal(ids.length, 25);
      assert.equal(new Set(ids).size, ids.length, 'unique ids');
      assert.equal(new Set(NAV_META.map((m) => m.code)).size, ids.length, 'unique codes');
      assert.deepEqual([...VIEW_ORDER].sort(), [...ids].sort(), 'the rail (= command palette) lists every view once');
      assert.equal(new Set(VIEW_ORDER).size, VIEW_ORDER.length);
      assert.deepEqual(views.map((v) => v.id), ids, 'lazy entries follow the registry');
      for (const id of ['golive', 'fieldkit']) {
        assert.equal(navGroups.filter((g) => g.viewIds.includes(id)).length, 1, `${id} in one rail group`);
        assert.equal(navGroups.find((g) => g.viewIds.includes(id)).id, 'platform');
      }
      for (const id of TAB_IDS) assert.ok(ids.includes(id), `tab ${id}`);
      for (const lang of ['ar', 'en']) for (const id of ids) {
        const nav = core[lang].nav[id];
        assert.ok(nav && typeof nav.title === 'string' && nav.title && typeof nav.short === 'string' && nav.short, `core.${lang}.nav.${id}`);
      }
      for (const id of ['golive', 'fieldkit']) assert.ok(!/[\u0600-\u06FF]/.test(core.en.nav[id].title + core.en.nav[id].short), `${id}: English label`);
      const art = read('js/ui/art.js');
      for (const m of NAV_META) assert.ok(art.includes(`'${m.icon}'`), `icon ${m.icon} (${m.id}) is drawn by js/ui/art.js`);
      for (const m of NAV_META) assert.ok(read(`js/views/${m.path.replace('./', '')}`).length > 0, `${m.id} module file`);
    },
  },
  {
    name: 'tools and docs follow the registry: tools/qa.mjs route list, AGENTS.md route count, README section codes',
    fn() {
      const qa = /args\.routes \|\| '([^']+)'/.exec(read('tools/qa.mjs'));
      assert.ok(qa, 'default route list in tools/qa.mjs');
      assert.deepEqual(qa[1].split(','), [...VIEW_ORDER], 'tools/qa.mjs visits every route, in rail order');
      const agents = read('AGENTS.md');
      const n = /all (\d+) routes/.exec(agents);
      assert.ok(n, 'AGENTS.md states the route count');
      assert.equal(Number(n[1]), NAV_META.length);
      assert.ok(/stamp-shell[\s\S]*stamp-build[\s\S]*sw-precache[\s\S]*tests\/run\.mjs/.test(agents), 'AGENTS.md gives the publish order');
      const readme = read('README.md');
      for (const code of ['PLT-04', 'FLD-01']) assert.ok(readme.includes(code), `README lists ${code}`);
    },
  },
  {
    name: 'loader: BOOT covers the static graph of js/app.js; the cockpit list is exactly its own graph beyond BOOT; no static module tags',
    fn() {
      const boot = listIn('BOOT');
      const cockpit = listIn('VIEW_MODS');
      assert.equal(new Set(boot).size, boot.length, 'no duplicate in BOOT');
      for (const f of [...boot, ...cockpit]) assert.ok(read(f).length > 0, `${f} exists`);
      const app = [...staticGraph('js/app.js')];
      for (const f of app) assert.ok(boot.includes(f), `${f} is imported by js/app.js at boot and must be preloaded`);
      const own = [...staticGraph('js/views/cockpit.js')].filter((f) => !boot.includes(f)).sort();
      assert.deepEqual([...cockpit].sort(), own, 'cockpit preloads = the cockpit view graph that BOOT does not carry');
      // the home route does not pull the go-live page dictionary (the strip registers js/i18n/golive-strip.js only)
      assert.ok(!own.includes('js/i18n/golive.js'));
      assert.ok(!/<script[^>]+type="module"/.test(html) && !/<link rel="modulepreload"/.test(html));
      assert.ok(html.includes('<link rel="stylesheet" href="css/field.css">'), 'the field kit stylesheet is linked (app-bar offline indicator)');
    },
  },
  {
    name: 'go-live strip strings live once: the page dictionary re-uses js/i18n/golive-strip.js',
    async fn() {
      const strip = (await import('../js/i18n/golive-strip.js')).default;
      const full = (await import('../js/i18n/golive.js')).default;
      for (const lang of ['ar', 'en']) {
        assert.equal(full[lang].strip, strip[lang].strip);
        assert.equal(full[lang].status, strip[lang].status);
        assert.deepEqual(Object.keys(strip[lang]).sort(), ['status', 'strip']);
      }
    },
  },
  {
    name: 'label in name (WCAG 2.5.3): go-live strip, plan link, connector details and the tour button are named by what they show',
    async fn() {
      const gl = (await import('../js/i18n/golive.js')).default;
      const wt = (await import('../js/i18n/walkthrough.js')).default;
      const intg = (await import('../js/i18n/integrations.js')).default;
      for (const lang of ['ar', 'en']) {
        const p = { x: '10', y: '18', name: 'Primavera P6' };
        const strip = `${gl[lang].strip.label}: ${fill(gl[lang].strip.value, p)} ${gl[lang].strip.cta}`;
        const cases = [
          [strip, fill(gl[lang].strip.aria, p)],
          [gl[lang].docs, gl[lang].docsAria],
          [gl[lang].map.details, fill(gl[lang].map.detailsAria, p)],
          [intg[lang].card.details, fill(gl[lang].map.detailsAria, p)],
          [wt[lang].launch, wt[lang].launchAria],
        ];
        for (const [visible, label] of cases) {
          // what components.setLabelInName builds: the visible text, then what the label adds (hidden text)
          const name = `${visible} ${nameExtra(visible, label)}`.trim();
          assert.ok(nameContains(name, visible), `${lang}: "${name}" contains "${visible}"`);
          assert.ok(nameContains(labelInName(visible, label), visible), `${lang}: labelInName keeps "${visible}"`);
        }
        // the strip's hidden addition only says where the link leads (the visible sentence is not read twice)
        const extra = nameExtra(strip, fill(gl[lang].strip.aria, p));
        assert.ok(extra && !extra.includes('18'), `${lang}: strip extra = "${extra}"`);
      }
      // the views use the helper, not a bare aria-label, for these controls
      assert.ok(/setLabelInName\(strip, gt\('aria'/.test(read('js/views/cockpit.js')));
      assert.ok(!/'aria-label': t\('docsAria'\)/.test(read('js/views/golive.js')) && !/'aria-label': t\('map\.detailsAria'/.test(read('js/views/golive.js')));
      assert.ok(!/'aria-label': t\('launchAria'\)/.test(read('js/ui/walkthrough.js')));
    },
  },
  {
    name: 'worked example entry points reach real records: field kit crate → MAR-S1-CW-014 / PO / AIR-1069; 360° hotspots; go-live rows',
    async fn() {
      const state = freshStore();
      const { CRATES, materialStatus, buildRegistry } = await import('../js/views/fieldkit.js');
      const gl = await import('../js/data/golive.js');
      const risk = psel.riskById(state, 'AIR-1069');
      assert.ok(risk && risk.id === 'AR69' && risk.code === 'AIR-1069', 'AIR-1069 resolves by code');
      const sb = state.platform.submittals.find((s) => s.code === 'MAR-S1-CW-014');
      const bq = state.platform.boqItems.find((b) => b.id === 'BQ2');
      assert.ok(sb && bq && bq.procurement, 'submittal and BoQ item seeded');

      // field kit (built without the seed) now answers from the seeded submittal, not from its fallback facts
      for (const crate of CRATES) {
        assert.equal(crate.submittal, sb.code);
        assert.equal(crate.po, bq.procurement.poRef);
        assert.equal(crate.boqItemId, sb.boqItemId);
        assert.ok(sb.riskIds.includes(risk.id) && crate.riskCode === risk.code);
        const ms = materialStatus(state, crate);
        assert.equal(ms.fromStore, true, 'status comes from platform.submittals');
        assert.equal(ms.rev, sb.currentRev);
        assert.equal(ms.approved, false, 'Rev 1 under review → do not install');
        assert.equal(ms.po, 'PO-S1-2026-0871');
        assert.equal(ms.risk && ms.risk.id, 'AR69', 'the crate links to AIR-1069');
        assert.ok(ms.poStatus && ms.poStatus !== '', 'PO status text');
      }

      // task templates of the three options: MT-0229 … MT-0234, never seeded as records
      const keys = risk.recommendationOptions.flatMap((o) => o.tasks.map((x) => x.key));
      assert.deepEqual(keys, ['MT-0229', 'MT-0230', 'MT-0231', 'MT-0232', 'MT-0233', 'MT-0234']);
      assert.ok(keys.every((k) => !state.platform.tasks.some((t) => t.code === k)));

      // 360° hotspots and the risk's own links
      const cp = SP.captureById('P360-S1-01');
      const site = state.sites.find((s) => s.id === cp.siteId);
      for (const hs of cp.hotspots) {
        if (hs.kind === 'aiRisk') { const r = psel.riskById(state, hs.code); assert.ok(r && r.id === hs.ref, `${hs.id} → ${hs.code}`); }
        if (hs.kind === 'submittal') assert.ok(state.platform.submittals.some((s) => s.id === hs.ref && s.code === hs.code), hs.id);
        if (hs.kind === 'zone') assert.ok(site.zones.some((z) => z.id === hs.ref), `${hs.id} → ${hs.ref}`);
      }
      assert.ok(risk.links.captures360.includes(cp.id) && risk.links.submittals.includes(sb.id));
      assert.equal(risk.zoneId, 'S1-Z2');

      // go-live capability rows link to existing routes; the chain row opens the worked example
      const ids = NAV_META.map((m) => m.id);
      for (const c of gl.CAPABILITIES) if (c.route) assert.ok(ids.includes(c.route), `${c.id} → ${c.route}`);
      const c2 = gl.CAPABILITIES.find((c) => c.id === 'c2');
      assert.deepEqual([c2.route, c2.params && c2.params.risk], ['airisks', 'AIR-1069']);
      for (const p of gl.PRIORITIES) assert.ok(ids.includes(p.route), `${p.key} → ${p.route}`);
      assert.deepEqual(gl.PRIORITIES.filter((p) => p.demo).map((p) => [p.key, p.route]), [['offline', 'fieldkit'], ['qr', 'fieldkit'], ['p360', 'spatial']]);

      // QR points drawn on the S1 plan stand for labels the field kit really generates
      const payloads = buildRegistry(state, 'S1').map((l) => l.payload);
      for (const q of SP.qrPointsFor('S1')) {
        assert.ok(site.zones.some((z) => z.id === q.zoneId), `${q.id} zone`);
        assert.ok(payloads.includes(`BX1:Z:${q.zoneId}`), `${q.id}: zone label exists`);
        if (q.kind === 'crane') assert.ok(payloads.includes('BX1:E:S1-TC-2'), 'crane TC-2 label');
        if (q.kind === 'crate') { assert.ok(q.labelEn.includes(CRATES[0].po)); assert.ok(payloads.includes(`BX1:M:${CRATES[0].id}`)); }
      }
    },
  },
  {
    name: 'go-live page says what the demo has today: offline, QR and 360° are "built as demo"; figures in the copy equal the seed',
    async fn() {
      const state = freshStore();
      const gl = await import('../js/data/golive.js');
      const dict = (await import('../js/i18n/golive.js')).default;
      const spatial = (await import('../js/i18n/spatial.js')).default;
      const sw = read('sw.js');
      // the things the copy now says exist do exist in this tree
      assert.ok(sw.includes('PRECACHE') && read('js/core/offline.js').includes('createOutbox'), 'service worker + outbox');
      assert.ok(read('js/ui/qr.js').length > 0 && read('js/ui/pano360.js').length > 0, 'QR and 360° viewer modules');
      assert.ok(/"camera=\(self\)/.test(read('vercel.json')), 'the camera is allowed for this origin (scanning)');
      for (const lang of ['ar', 'en']) {
        const d = dict[lang];
        for (const stale of ['no service worker', 'camera=()', 'disables the camera', 'لا عامل خدمة', 'تعطّل الكاميرا']) {
          assert.ok(!JSON.stringify(d.cap).includes(stale) && !JSON.stringify(d.prio).includes(stale), `${lang}: "${stale}" is no longer true`);
        }
        assert.notEqual(d.cap.c14.today.trim().replace(/\.$/, ''), lang === 'en' ? 'None' : 'لا يوجد');
        assert.ok(d.cap.c2.today.includes('MAR-S1-CW-014') && d.cap.c2.today.includes('AIR-1069'));
        // counts written in the copy are the seed's counts
        assert.ok(d.cap.c15.today.includes(String(SP.CAMERAS.length)), `${lang}: simulated cameras`);
        assert.ok(d.prio.p360.today.includes(String(SP.CAMERAS.length)));
        assert.ok(d.cap.c16.today.includes(String(state.integrations.length)), `${lang}: HSE connectors`);
        assert.ok(d.matrix.sub.includes(String(gl.CAPABILITIES.length)), `${lang}: capability count`);
        assert.ok(d.prio.offline.today.length > 40 && d.prio.qr.today.length > 40);
        // still honest about what is missing
        assert.ok(/server|خادم/.test(d.cap.c11.today) && /server|خادم/.test(d.cap.c12.today));
        assert.ok(/AI-generated|مولّدة بالذكاء الاصطناعي/.test(d.cap.c14.today));
        assert.ok(!/roadmap|خارطة/i.test(spatial[lang].legend.qr), 'QR points on the plan are the field kit demo, not a roadmap concept');
      }
      assert.equal(SP.captureById('P360-S1-01').captures.filter((c) => c.src).length, 1, 'one simulated capture, as the copy says');
      const outboxKinds = (await import('../js/core/offline.js')).OUTBOX_KINDS;
      assert.equal(outboxKinds.length, 4, 'the copy says four field actions');
    },
  },
  {
    name: 'field kit actor has an English mirror (alerts acknowledged / tasks started from #/fieldkit)',
    async fn() {
      const data = await import('../js/i18n/data/index.js');
      const actor = /const FIELD_ACTOR = '([^']+)'/.exec(read('js/core/offline.js'))[1];
      assert.equal(/const FIELD_ACTOR = '([^']+)'/.exec(read('js/views/fieldkit.js'))[1], actor, 'one actor name');
      assert.equal(data.terms[actor], 'Field kit');
      assert.equal(core.ar.nav.fieldkit.title, actor);
    },
  },
  {
    name: 'live engines load after the first view: the context member is late-bound, so a view mounted first reaches the engine later',
    async fn() {
      const { lateBound } = await import('../js/core/router.js');
      let engine = null;
      const live = lateBound(() => engine);
      // what a view does when it mounts: read ctx.live once and keep it
      const view = { live, pings: () => (live && typeof live.getPings === 'function' ? live.getPings('S1') : 'fallback') };
      assert.equal(view.pings(), 'fallback', 'no engine yet → the view falls back (as with a missing module)');
      assert.equal(typeof live.getBlips, 'undefined');
      engine = { name: 'live', getPings(site) { return `${this.name}:${site}`; }, getBlips: () => [] };
      assert.equal(view.pings(), 'live:S1', 'the same reference now forwards to the engine, bound to it');
      assert.equal(typeof live.getBlips, 'function');
      assert.equal(live.name, 'live');
      const app = read('js/app.js');
      assert.ok(/live: liveRef,/.test(app) && /platformLive: platformLiveRef,/.test(app), 'buildContext hands out the late-bound members');
      assert.ok(/window\.biltix = Object\.freeze\(\{ store, bus, router, live,/.test(app), 'window.biltix.live is the engine itself');
    },
  },
  {
    name: 'offline layer starts once; a field action taken before it is ready waits for it (deep link to #/fieldkit, boot tail later)',
    async fn() {
      const off = await import('../js/core/offline.js');
      const state = freshStore();
      const q = psel.alertQueue(state, {});
      const alert = [...q.immediate, ...q.standard].find((a) => !a.acknowledged);
      assert.ok(alert, 'an unacknowledged alert in the seed');
      const heard = [];
      const stop = bus.on('field:outbox', (p) => heard.push(p));
      const first = off.initOffline({ store, bus });            // the field kit on mount …
      const acting = off.act('alert.ack', { alertId: alert.id, code: alert.code, by: 'عُدّة الميدان' }, { key: `alert.ack:${alert.id}:integration` });
      const second = off.initOffline({ store, bus });           // … and js/app.js at the end of boot
      assert.equal(first, second, 'one initialisation, one promise');
      assert.equal(await off.offlineReady(), await first);
      const res = await acting;
      assert.equal(res.duplicate, false);
      assert.equal(res.queued, false, 'online: applied at once');
      assert.equal(Boolean(store.state.platform.alerts.find((a) => a.id === alert.id).acknowledged), true, 'the alert was acknowledged in the store');
      assert.ok(heard.length >= 1, 'views mounted earlier are told the outbox is ready');
      assert.equal(off.outbox().count(), 0);
      if (typeof stop === 'function') stop();
      await off.outbox().clearAll();
      freshStore();
    },
  },
  {
    name: 'English first paint stays: static shell is English, the Arabic pre-paint runs before <main>, the loader after it',
    fn() {
      const iPre2 = html.indexOf("if (document.documentElement.getAttribute('lang') !== 'ar') return;");
      const iMain = html.indexOf('<main id="main"');
      const iLoader = html.indexOf('var PRE = /*@pre-begin*/');
      assert.ok(iPre2 > 0 && iMain > iPre2 && iLoader > iMain, 'order: Arabic shell labels → <main> → pre-view + loader');
      assert.ok(/var lang = document\.documentElement\.getAttribute\('lang'\) === 'ar' \? 'ar' : 'en';/.test(html), 'the pre-view defaults to English');
      assert.ok(/<html lang="en" dir="ltr"/.test(html));
      assert.ok(/id="userAvatar" data-initial="F" aria-hidden="true"><\/span>/.test(html), 'avatar initial is drawn by CSS (label in name)');
      assert.ok(/aria-label="EN — English" aria-pressed="true"/.test(html) && /aria-label="ع — العربية" aria-pressed="false"/.test(html));
    },
  },
  {
    name: 'field kit: a background repaint (outbox, network, live data, filters) never rebuilds the open result — an open observation form keeps its input',
    fn() {
      const src = read('js/views/fieldkit.js');
      const paintAll = /function paintAll\(\) \{([^\n]*)\}\n/.exec(src);
      assert.ok(paintAll, 'paintAll is one line');
      assert.ok(!/paintResult\(/.test(paintAll[1]) && /refreshResult\(\)/.test(paintAll[1]), 'paintAll refreshes the result in place');
      const refresh = /function refreshResult\(\) \{([\s\S]*?)\n    \}\n/.exec(src);
      assert.ok(refresh && /live\.sig\(\) !== live\.built/.test(refresh[1]) && /live\.update\(\)/.test(refresh[1]), 'rebuild only when the facts the block was built from changed');
      // the zone result (the one that carries the form) has no signature: nothing in the background can rebuild it
      const zone = /function zoneResult\(body, label, site\) \{([\s\S]*?)\n    \}\n\n    function reportForm/.exec(src);
      assert.ok(zone && /return \{ update \};/.test(zone[1]) && !/\bsig\b\s*[:,}]/.test(zone[1].replace(/sentSig|const sig = e/g, '')), 'zone result: in-place updates only');
      // every bus subscription of the page goes through the throttled paintAll
      for (const ev of ['field:outbox', 'field:network', 'filters:change']) assert.ok(new RegExp(`bus\\.on\\('${ev}', schedule\\)`).test(src), ev);
      // one idempotency key per opened form: a second observation from the same scan is a new record, not a duplicate
      assert.ok(/current\.formKey = off\.randomKey\('risk\.add'\)/.test(src) && !/current\.formKey \|\|/.test(src));
      // a ticked checklist item is locked, not disabled, so it keeps the focus
      assert.ok(/setAttribute\('aria-disabled', 'true'\)/.test(src) && !/cb\.disabled = true/.test(src));
    },
  },
];
