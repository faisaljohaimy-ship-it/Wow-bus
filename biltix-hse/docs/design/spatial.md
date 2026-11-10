# Site spatial view (SEC-12) and simulated site cameras

Route `#/spatial` · module `js/views/spatial.js` · data `js/data/spatial-seed.js` · feed renderer `js/ui/camfeed.js` ·
dictionary `js/i18n/spatial.js` (namespace `spatial`) · styles: the "Spatial" section at the end of `css/platform.css` ·
tests `tests/spatial.test.mjs`, `tests/spatial-layout.test.mjs`.

## 1. What it is, and what it is not

An engineering-style plan of each site that links every zone to the records that already carry a `siteId` / `zoneId`:
HSE register risks, sensors, simulated cameras, open permits, incidents and inspections. Selecting a camera opens a
viewer with a **procedurally drawn, simulated** feed.

Honesty rules (CONTRACT §5) that the view enforces:

- **No camera is connected.** Every camera record carries `simulated: true, connected: false`. The head shows
  `Demo` and `Cameras: simulated · not connected`; the camera card repeats it; the viewer carries the taxonomy badges
  `Simulated` (`demo`) and `Camera not connected` (`not_connected`), the line "Simulated feed — no camera is connected",
  and the picture itself has a burned-in `SIMULATED FEED · NO CAMERA CONNECTED` tag and `… FPS SIM` counter.
- Never shown: "Live", "Connected", "REC", recording claims, detection confidence or any model accuracy figure.
- Detection boxes are **illustrative** and appear **only** for PPE non-compliance events that exist in the simulated
  activity feed for that zone (last 12 h). The tag reads `ILLUSTRATIVE · NO HARD HAT` (ar `توضيحي · بدون خوذة`), the drawn
  worker lacks the item, and the viewer lists the events with a `Simulated event` badge. No event: no box, and the
  viewer says so.
- The plan is labelled "Illustrative layout, not a survey". Sensors have no surveyed coordinates in the data, so their
  markers are placed inside their zone (stable hash) and the legend says "approximate spot".

## 2. Data (`js/data/spatial-seed.js`)

Coordinates are **site-normalised** (x 0..1 west to east, y 0..1 north to south), the same space as the zone rectangles
in `js/data/seed.js`. `PLAN` maps them into the SVG viewBox (1000 × 640, site boundary in `PLAN.inner`).

- `SITE_PLANS[siteId]`: `kind` (urban | desert, used by the feed background), `widthM` (scale bar), `trueNorthDeg`,
  `footprints` (polygon, `label`/`labelEn`, `levels { done, total }`, optional core), `structures` (shed, cabin,
  container, tank, plant, stack, scaffold), `cranes` (tower | mobile, slewing radius), `gates` (side + label),
  `roads`, `arrays` (solar rows), `pits` (excavation benches), `manholes` (codes stay Latin).
- `CAMERAS` (25, four or five per site): `id` = code (`CAM-S1-03`), `siteId`, `zoneId`, `x`, `y`, `heading`
  (degrees clockwise from plan north), `fov`, `mountHeight` (m), `lensMm` (focal length, a number: the view writes
  `4 mm` / `٤ مم` through `t('spatial.units.mm')` and `fmt.num`), `range` (cone length on the plan), `scene`
  (feed preset), `purpose` + `purposeEn` (read through `i18n.L`).
- `zoneLinks(state, siteId, zoneId, { sel })` — **one definition per metric**: it calls the same selectors the
  registers use, with the global filters (period) and the site, then narrows to the zone:
  risks = `sel.filteredRisks` (open + closed-in-period, the register rows), overdue = `sel.isOverdueRisk`,
  permits = `sel.filteredPermits` minus closed (`مغلق`), incidents = `sel.filteredIncidents`, inspections =
  `sel.filteredInspections`, sensors = store sensors of the zone, cameras = this module. No local re-definition.
- `ppeEventsFor(state, camera)` — **structural first**: feed events of the live engine (`js/data/live.js`) carry the
  `zoneId` of the zone their sentence names (random phrases with `{zone}`, sensor alarms, permit warnings), and a
  `zoneId` decides. Older events (the seeded history, a feed stored by an earlier build) have only `siteId`; for those
  the zone is matched on the zone name in the sentence (Arabic title with digits normalised, or the English mirror).
  The unit tests prove zone names are unambiguous inside a site and that a disagreeing `zoneId` wins. Compliance
  sentences (tone `good`) never produce a box.
- `planObstacles(siteId, site, { sensors, measure, isEn, narrow })`, `layoutZoneLabels(site, names, { obstacles })`,
  `hitPolygons(cams, r)` — the pure geometry behind §4 (tested in node with approximate widths; the view measures
  with the page fonts).
- `spatialTargetForAiRisk(state, risk)` — for the AI-risk drawer: the risk's own zone, else the zone of the HSE register
  risk its text names (`R-1001`, same site), else the site only for site-domain risks; otherwise no link. Never guesses.

## 3. Route, deep links and history

`#/spatial?site=S1&zone=S1-Z2&camera=CAM-S1-03` (optional `&risk=R9` highlights that register risk in the zone panel).
The URL is the truth (the view reads `location.hash`, so a router re-mount after `replaceState` keeps the selection).

- Site and zone changes **push** a history entry: browser back steps through selections (the router re-mounts the
  view; a same-route re-mount skips the entrance animation and returns focus to the selected zone).
- Opening / closing the viewer **replaces** the entry (back from an open viewer returns to the previous place).
- Entry points: AI-risk drawer "Show on site map" (`js/views/shared/risk-drawer.js`, Overview → Details), the HSE
  register's own drawer (`js/views/risks.js`, Overview → Key facts → Zone: "Show on site map" for every risk with a
  zone, `#/spatial?site=…&zone=…&risk=…`, the risk is highlighted in the zone panel), risk radar plan and sensor cards
  ("Show on site map", per-zone links in the plan table, `js/views/radar.js`). From the view: risks → `#/risks?id=`,
  permits → `#/permits?id=`, incidents → `#/incidents?id=`, inspections → `#/inspections?id=`, sensors →
  `#/radar?site=…` (the radar follows `?site=` while the global site filter is "all sites").

## 4. Plan drawing

- SVG built with `createElementNS` + `textContent` only. The drawing is `direction: ltr` and **never mirrors**; Arabic
  labels get `direction="rtl"` with start/end anchors swapped so they keep their physical place. Only the UI chrome
  (cards, lists, head) follows the page direction.
- Layers: paper + engineering grid · public road · zones (interactive) · hoarding · features (clipped to the site, no
  pointer events) · zone labels + open-risk badges · cameras (interactive) · north arrow (true-north angle), scale bar
  (round length ≈ 18 % of the site width, numbers through `fmt.num`) and title block.
- Zones and cameras are `role="button"` `tabindex="0"` SVG groups (Enter / Space), with accessible names that carry the
  counts; the zone has `aria-pressed`. The table "Zones and links" is the text alternative (same numbers, same
  selection). Zone fill tint follows the worst open-risk tier, always with the number badge (never colour alone).
- **Label placement** (`SP.layoutZoneLabels`). Per zone, in this order: the zone code (top start corner preferred,
  never under a camera; it may sit on a building outline), the zone name, then the open-risk badge (top end corner
  preferred; it never covers the name). The name is scored over candidate boxes (bottom first, centred, start, end,
  quarter positions, a few px steps upwards) against weighted obstacles from `SP.planObstacles`: camera bodies, building
  outlines, level plates, crane masts, gates, manholes, sensors and feature labels are hard; sheds, stacks, roads,
  solar rows and pits are soft (a haloed label may sit on them). It falls back to two lines, then to the specific
  part of the name (after " — ", e.g. "الأعمال الكهروميكانيكية" for "المبنى ب — الأعمال الكهروميكانيكية"), then
  to an ellipsis. The **full name** stays in the zone button's accessible name, the zone panel and the table. Widths
  are measured with the page fonts (canvas `measureText`, `--font-sans` / `--font-mono`) and laid out again once
  `document.fonts` has loaded. `tests/spatial-layout.test.mjs` checks every site in Arabic and English: no name on a
  camera or a building outline, no code or badge under a camera, everything inside its zone.
- **Camera touch targets** (WCAG 2.5.8). The hit area is a path around the camera: radius ≥ 11 CSS px (22 px
  target) with a fine pointer and ≥ 13 CSS px (26 px target) on a coarse pointer or a plan narrower than 640 px,
  computed from the rendered scale (and the framing) by a `ResizeObserver`; between two cameras closer than the
  target, both areas are cut along the bisector (1 unit gap), so neither covers the other (NEOM's back-to-back pole
  cameras, 33 plan units apart, get a half target each). The view cone is `pointer-events: none` (a tap inside a cone
  selects the zone underneath). On narrow plans the camera glyph is drawn at 2× and the code placement keeps clear of
  it. The equivalent full-size control is the "Site cameras" list below the plan (40 px buttons), which the plan note
  points to; this covers the split pairs too.
- **Framing.** Selecting a zone (plan, table, camera tile, "Show the zone", camera viewer) frames it: the SVG viewBox
  tweens once (≈ 0.5 s, 0.64 s with the Cinematic background, cubic in-out; rAF only while moving) to the zone plus a
  margin, at most ≈ 2.1× the site, clamped to the drawing. A "Show whole site" button appears while the plan is framed, in the
  drawing's top end margin by the north arrow (under the drawing on plans ≤ 620 px, so it never covers the zone); focus
  then returns to the selected zone. Clearing the selection returns to the whole site. Keyboard focus moving to a zone
  or camera that is mostly outside the framed view shows the whole site again. A deep link or
  back / forward with a zone starts framed without a tween. Under reduced motion (OS or settings) there is no framing
  at all: the whole site stays in view and the selection shows by outline and tint. Strokes of zones and focus rings
  use `vector-effect: non-scaling-stroke`, so they keep their CSS-px width at any scale.
- Narrow plans (container query ≤ 620 px): names, feature labels and camera codes hide (the table carries them), zone
  codes and badges grow (a separate 30 px code element placed for that size). A framed zone shows its own name again.
  Camera codes on the plan show for the camera in hand (hover, focus, open) and the selected zone.
- Nothing on the plan animates continuously; hover / selection use short colour transitions (off under reduced motion).

### Zone panel and announcements

- The panel is **not** a live region (sensor readings repaint every 5 s). One `sr-only` `aria-live="polite"` region
  is written only on a user action: a short summary when a zone is selected or cleared ("Selected zone S1-Z2, Tower
  crane 2: 1 open risk, 1 sensor, 1 camera, 1 open permit."), when a camera viewer opens, and when the site changes.
  The PPE list in the viewer is not live either.
- Live data (store:change, filters:change) re-renders the panel when its signature (counts, risk / permit /
  inspection status, record ids) changes. If focus is inside the panel the panel is marked **dirty** instead: the
  counts are patched in place at once, and the lists re-render on `focusout` once focus has left the panel, so the
  reader keeps their place and nothing stays stale. The signature is recorded only when the panel really renders.

### Zones and links table

- Number cells use `.num-col` (`text-align: end`, tabular figures, a real table cell). The global `.num`
  (`css/base.css`) is `inline-block` and is not used on `th` / `td`.
- Containers ≤ 560 px stack each row into a card: the zone button on top, then the seven numbers in a 4-column grid,
  each with a visible label from `data-label` (`content: attr(data-label) / ""`, so it is not read twice). Explicit
  `role="table|rowgroup|row|columnheader|rowheader|cell"` keep the table semantics while the display changes.
- Print is always the real table (container query disabled), numbers aligned under their headers.

## 5. Camera viewer and feed renderer

The viewer is `components.modal` (size lg, widened by `.sp-viewer-dialog`). Inside, `createCamFeed(host, opts)` builds a
`dir="ltr"` frame: plate canvas, dynamic canvas, static vignette / scanline layer and a DOM OSD (camera code, zone,
Riyadh timestamp ticking once per second, `IR` at night, the simulated tag).

- **Off the main thread.** Both canvases are transferred (`transferControlToOffscreen`) to a module worker whose script
  is `camfeed.js` itself (the module detects `WorkerGlobalScope`). The worker loads IBM Plex Mono / Sans / Arabic from
  `assets/fonts/` for the burned-in text. Without OffscreenCanvas or module workers, or if the worker fails, the same
  renderer runs on the main thread on fresh canvases. The worker's clock is aligned to the page clock.
- **Scene.** Pinhole camera from the record (`fov` → focal length, `mountHeight` → camera height and tilt) with a slight
  barrel distortion. Sky, sun glow (azimuth/elevation from the Riyadh hour vs the camera heading), dawn / day / dusk
  palettes, infrared monochrome at night; far skyline (urban) or ridges (desert); ground texture and tyre tracks;
  preset per zone — `frame` (concrete frame: slabs, columns, deep interior, re-propping, blockwork on lower floors,
  formwork, rebar starters, edge protection, nets, hoist, scaffolding), `midrise`, `yard`, `gate` (kerbs, barrier,
  guard cabin, safety board without text), `trench`, `solar`, `warehouse`, `earthworks`; contact shadows and depth haze.
  Dynamic layer: tower-crane jib (or mobile-crane boom) slewing slowly with trolley, hook and load, aviation lights,
  walking workers with hard hats and vests, a vehicle with beacon, sensor grain, frame counter, illustrative boxes.
- **When it renders.** Only while the viewer is open, the frame is on screen (IntersectionObserver) and the tab is
  visible (`visibilitychange`); 15 fps (a typical CCTV rate; capped at 30). Reduced motion (`prefers-reduced-motion`
  or `html[data-motion="reduce"]`) draws one still frame, shows `Still frame — reduced motion`, and resumes if motion is
  turned back on. A still frame's burned-in counter reads `STILL · SIM` (never a frame rate), and the camera details
  say "Still frame (reduced motion is on)". Closing the viewer terminates the worker.
- **Main-thread fallback** (no OffscreenCanvas / module worker, or the worker failed): the same renderer at 6 fps
  (`FALLBACK_FPS`, never above 8) on half-resolution canvases (384 × 216, drawn in the same 768 × 432 units, scaled
  by CSS), with the sensor grain baked into the plate instead of moved per frame. Measured, the cost of a canvas in
  the page is not the drawing (≈ 1 ms a frame) but the full document frame each picture forces (style, paint,
  layerize, commit: ≈ 4 ms here, so even 4 fps cost ≈ +23 ms/s). So the two layers are composed into a **detached**
  canvas whose `captureStream(0)` feeds a muted, inline `<video class="cf-video">` (`track.requestFrame()` per
  picture): frames reach the compositor without a document frame. Without `captureStream` the canvases stay in the
  page. The details then say "6 fps (simulated, reduced resolution …)". `feed.stats()` reports `backend`, `fps`,
  `res` and `present` (`offscreen` | `video` | `canvas`); `onMode` keeps the viewer's caption, frame-rate row and
  still badge in step.
- **PPE boxes.** Helmet / vest / glasses events go to the nearest legible ground worker. A **harness** event goes to a
  worker who is actually at height: every preset has one (a scissor lift with guardrail in the foreground of `frame`,
  `yard`, `gate`, `trench`, `solar`, `earthworks`; the façade scaffold in `midrise`; the MEWP in `warehouse`). Workers at
  height are drawn with a lanyard clipped to the guardrail; the flagged one's lanyard hangs loose. No legible worker
  at height: no box (the viewer still lists the event).
- **Lens iris.** When the viewer opens, the picture is revealed by an eight-blade aperture (an animated `clip-path`
  octagon that opens while turning 60°, ≈ 0.5 s, ease-out) over a dark shell; it waits for the first drawn frame
  (`feed.ready`, at most 0.9 s) so the aperture never opens on an empty canvas. The Cinematic background adds a short
  focus pull (blur 5 px → 0, 0.9 s). Off under reduced motion and with the Static background.

## 6. Performance (CDP `Performance.getMetrics` TaskDuration, ms of main thread per second)

Headless Chromium (Playwright), 1440 × 900, `#/spatial?site=S1&zone=S1-Z2`, 3.5 s settle (+2.5 s after opening the
viewer), 5 s window. The machine was shared with other jobs (load 5 – 6 on 4 cores), so absolute values are high and
noisy: every row is the median of 3 runs, base build (8a79b67) and this build alternating run by run. "Fallback" =
`HTMLCanvasElement.prototype.transferControlToOffscreen` removed before load (no worker path).

| Condition | base 8a79b67 | this build |
|---|---|---|
| viewer closed (zone selected, plan framed) | 10.8 | 9.8 |
| viewer open, worker + OffscreenCanvas, 15 fps | 14.2 (+3.4) | 14.4 (+4.6) |
| viewer open, forced fallback | 78.8 (+68, 15 fps, full size, canvas in the page) | +10.0 over closed (closed 8.6 / 6.7 / 8.0, open 18.6 / 22.2 / 17.9; 6 fps, half size, video) |
| fallback steps measured on the way | — | 8 fps half size canvas in the page: +30.4 · 5 fps: +26.7 · 4 fps: +23.3 · 8 fps via video: +14.3 / +18.5 |
| select a zone in the 5 s window (one framing tween, panel, table, announcement) | 48.3 | 61.6 |
| reduced motion, viewer closed | 8.5 | 8.2 |
| reduced motion, viewer open (still frame) | 10.2 | 11.7 |

Reading: idle cost is unchanged (the label layout runs once per build of the plan and again once fonts load; the
ResizeObserver, framing tween and iris run only on resize or a user action; live repaints set attributes only when
they change, and sensor ticks no longer repaint the plan). The worker path stays within +5 ms/s of the closed view.
The fallback was dominated by one document frame per picture (≈ 4 ms each here), not by drawing; the captureStream →
`<video>` path removes those frames and leaves the drawing (≈ 1 ms) and the stream copy (≈ 0.75 ms) per frame, hence
6 fps for ≤ +15 ms/s. A zone selection costs ≈ 65 ms of main thread once (0.5 s viewBox tween + re-render), then
nothing. In a quieter run before these changes the base measured closed 9.4, worker 12.2, fallback ≈ 60.

## 7. Tests

`node tests/run.mjs spatial`: camera codes unique and Latin, site / zone exist, scene preset known, plausible optics,
English mirrors; positions inside the plan and inside their own zone; plan features inside the site; sensor markers
inside their zone; zone link counts equal the selector / store counts for every zone of every site, and the zones add
up to the site register; PPE boxes only follow PPE non-compliance events of the zone (Arabic-Indic digits included);
AI-risk map targets. `tests/spatial-layout.test.mjs`: zone codes, badges and names inside their zone and clear of
cameras and building outlines for every site in Arabic and English; hit areas keep their radius alone and split along
the bisector between neighbours (no seeded pair overlaps); live-engine feed events carry a `zoneId` of their own
site, PPE sentences name that zone, and a `zoneId` wins over the sentence; camera optics are numbers (`lensMm`).

## 8. Known limits

- Plan geometry (footprints, roads, gates, cranes) is illustrative seed data, not a survey; sensor spots are placements.
- Feed events stored before `zoneId` existed (the seeded history, older saved state) still match PPE zones by the
  sentence; new live-engine events match structurally.
- Two cameras closer than one touch target (NEOM's back-to-back pole, `CAM-S3-01` / `CAM-S3-02`) split their areas,
  so each is narrower than 24 px on a phone plan; the "Site cameras" list (full-size buttons) is the equivalent
  control (WCAG 2.5.8 "equivalent" exception), and framing the zone enlarges both.
- Label placement is a scored search, not a solver: in a crowded zone it may fall back to the specific part of the
  name or to an ellipsis (the full name is always in the accessible name, the panel and the table). Arabic names with
  numeric ranges ("الطوابق 1–3") are seed text and follow the Unicode bidi algorithm on the plan and in the table.
- With the main-thread fallback the picture is softer (half resolution, static grain) and slower (6 fps) by design.
