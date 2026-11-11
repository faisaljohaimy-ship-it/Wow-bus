# Offline, outbox and QR — field kit (`#/fieldkit`)

Status: **demo**. Offline work and QR workflows are not in the approved scope yet (open question Q1 in
`docs/specs/v3-precision/spec.md`). Everything below runs in the browser on demo data; there is no server.

## Files

| File | Role |
|---|---|
| `sw.js` | Service worker, root scope, registered as `sw.js?v=<build stamp>` |
| `tools/sw-precache.mjs` | Rewrites the `PRECACHE` list in `sw.js` from the files on disk (`--check` to verify) |
| `js/core/offline.js` | Outbox, network state (+ simulated outage), service-worker registration, app-bar indicator |
| `js/ui/qr.js` + `js/vendor/qrcode-generator.js` | Payloads, QR matrix / SVG, BarcodeDetector scanning (encoder: MIT, `js/vendor/QRCODE-LICENSE.txt`) |
| `js/views/fieldkit.js` | The page: connectivity + outbox, scan, field actions, label sheet, on-site needs |
| `js/views/shared/offline-panel.js` | Status panel used by Settings SET-08 "Offline" and the field kit |
| `js/i18n/fieldkit.js` | All strings (AR/EN) |
| `css/field.css` | Indicator, page, A4 print sheet |
| `tests/field.test.mjs` | Encoder vectors, payload parser, outbox ordering / idempotency, precache drift |

## Service worker

- **Versioned by the build stamp.** `offline.js` reads `<meta name="biltix-build">` and registers
  `sw.js?v=<stamp>`. Caches: `biltix-shell-<stamp>` (precache) and `biltix-rt-<stamp>` (runtime). A new stamp is a
  new worker: it precaches, calls `skipWaiting()`, deletes older `biltix-*` caches and claims the pages.
  **Run `node tools/stamp-build.mjs` before every publish** — without a new stamp, installed copies keep the old shell.
- **Precache:** `./`, every `js/**/*.js`, `css/*.css`, fonts, explainer posters and captions, the previews of the
  simulated 360° captures, favicon, manifest (135 files, ≈ 6.1 MB uncompressed at v3.8). Never the MP4s: media and
  Range requests bypass the worker. Never the full panoramas (≈ 1 MB each): one is cached at runtime the first
  time it is opened, so the 360° viewer shows its "no picture" state offline until then.
  After adding or removing a file run `node tools/sw-precache.mjs`; the test suite fails when the list drifts.
  The list holds file names only (it does not depend on the build stamp); the caches are named after the stamp.
  Publish order: `stamp-shell` → `stamp-build` → `sw-precache` → tests → commit (`AGENTS.md` "Publishing").
- **`index.html` starts the app itself:** there is no static `<script type="module">`; the inline loader adds the
  module preloads and `js/app.js` after the first paint. Those requests are same-origin GETs for precached files,
  so they are answered from the shell cache like any other; the cached `./` carries the stamped page headers.
- **Strategies:** navigations network-first (5 s timeout when a copy exists, cached shell offline, a bilingual
  offline page when nothing is cached); precached files cache-first (never revalidated one by one, so builds never
  mix); any other same-origin GET stale-while-revalidate. `?build-check=` (app.js `watchForNewBuild`) is never
  answered from cache. When the network HTML carries a different stamp, the old worker forwards everything to the
  network until the new worker takes over, so the "Reload" offered by the new-version notice loads one build.
- **Where it registers:** HTTPS (and `localhost` only with `?sw=1` or `localStorage['biltix-hse:sw'] = 'on'`).
  Never in node tests, on `file:`, or under automation (`navigator.webdriver`) without that opt-in, so
  `tools/qa.mjs` runs without a worker. `'off'` in the same key disables it.
- **Vercel:** `/sw.js` is served `Cache-Control: no-cache` with `Service-Worker-Allowed: /`; registration uses
  `updateViaCache: 'none'`. `Permissions-Policy` now allows `camera=(self)` (needed for scanning; microphone and
  geolocation stay off).
- Settings → SET-08 shows network, offline copy (state + cached files), `navigator.storage.estimate()`, the
  persistence grant (with a request button) and the outbox; "Clear the offline copy" deletes the caches and
  unregisters the worker (data and outbox untouched).

## Outbox

Kinds: `risk.add` (field observation from a zone label), `alert.ack`, `task.status` (start), `checklist.tick`
(crane pre-use check). Each entry has an idempotency key — deterministic per intent (`alert.ack:AL7`,
`task.status:MT3:قيد التنفيذ`, `checklist.tick:N15:0`) or random per form (`risk.add:<uuid>`). The queue is FIFO;
`replay()` applies pending entries in order, records applied keys (a key is never applied twice, even after the
list is cleared), keeps failures visible as "needs attention" and retries them on the next replay. A task
transition queued from status A is refused if the task is no longer in A (conflict — nothing overwritten).

Storage: IndexedDB (`biltix-hse-field` / `kv` / `outbox`) → localStorage (`biltix-hse:outbox`) → memory.
**Demo truth:** there is no server; "sync" replays the queue into this browser's store and the UI says so.
Actions on other pages save to this browser directly and do not pass through the outbox. The field kit's
"Simulate an outage" switch queues field-kit actions without touching the real network.

## QR payloads and labels

`BX1:<K>:<ID>` with K = `Z` zone · `E` equipment (cranes `S1-TC-2`, cameras `CAM-S1-03`) · `M` material (façade
crates `CR-0871-01…04` of PO-S1-2026-0871) · `P` permit (`PTW-5529`). IDs are A–Z, 0–9 and `-` only, ≤ 32
characters: no names or free text. The parser accepts the short manual form (`Z:S1-Z2`), lower case, spaces and
same-origin URLs with `?code=`; URLs on another host are refused (QR phishing). Labels are generated on the device
(error correction Q) and printed on A4 (3 × 3 labels of 60 × 84 mm with a 44 mm code, the code printed under it).
A crate scan answers from the submittal: "Approval pending — do not install" unless the last revision is code A/B;
when the build has no `platform.submittals` record the scenario facts are shown and labelled as such.

## iOS and device caveats

- Safari on iOS may evict script-written storage (caches, IndexedDB) after 7 days without use unless the app is
  added to the Home Screen; `navigator.storage.persist()` is not a guarantee there.
- Safari (and Firefox) have no `BarcodeDetector`: scanning falls back to manual entry or the system camera opening
  a same-origin URL. Camera permission is asked per site and may be asked again each session.
- No Background Sync on iOS: the queue replays when the app is opened (or comes back online) while open.
- Private browsing can block IndexedDB; the outbox then falls back to localStorage or memory and says which.
- On site: managed Android devices with Chrome, MDM, outdoor-rated labels and a real server with signed sync are
  prerequisites (listed on the page under "What is needed on site").
