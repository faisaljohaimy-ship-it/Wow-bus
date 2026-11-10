# Site spatial view (SEC-12) and simulated site cameras

Route `#/spatial` · module `js/views/spatial.js` · data `js/data/spatial-seed.js` · feed renderer `js/ui/camfeed.js` ·
dictionary `js/i18n/spatial.js` (namespace `spatial`) · styles: the "Spatial" section at the end of `css/platform.css` ·
tests `tests/spatial.test.mjs`.

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
  (degrees clockwise from plan north), `fov`, `mountHeight` (m), `lens`, `range` (cone length on the plan), `scene`
  (feed preset), `purpose` + `purposeEn` (read through `i18n.L`).
- `zoneLinks(state, siteId, zoneId, { sel })` — **one definition per metric**: it calls the same selectors the
  registers use, with the global filters (period) and the site, then narrows to the zone:
  risks = `sel.filteredRisks` (open + closed-in-period, the register rows), overdue = `sel.isOverdueRisk`,
  permits = `sel.filteredPermits` minus closed (`مغلق`), incidents = `sel.filteredIncidents`, inspections =
  `sel.filteredInspections`, sensors = store sensors of the zone, cameras = this module. No local re-definition.
- `ppeEventsFor(state, camera)` — feed events carry `siteId` but no `zoneId`; the zone is matched on the zone name the
  live engine writes into the sentence (Arabic title with digits normalised, or the English mirror). The unit test
  proves zone names are unambiguous inside a site. Compliance sentences (tone `good`) never produce a box.
- `spatialTargetForAiRisk(state, risk)` — for the AI-risk drawer: the risk's own zone, else the zone of the HSE register
  risk its text names (`R-1001`, same site), else the site only for site-domain risks; otherwise no link. Never guesses.

## 3. Route, deep links and history

`#/spatial?site=S1&zone=S1-Z2&camera=CAM-S1-03` (optional `&risk=R9` highlights that register risk in the zone panel).
The URL is the truth (the view reads `location.hash`, so a router re-mount after `replaceState` keeps the selection).

- Site and zone changes **push** a history entry: browser back steps through selections (the router re-mounts the
  view; a same-route re-mount skips the entrance animation and returns focus to the selected zone).
- Opening / closing the viewer **replaces** the entry (back from an open viewer returns to the previous place).
- Entry points: AI-risk drawer "Show on site map" (`js/views/shared/risk-drawer.js`, Overview → Details), risk radar
  plan and sensor cards ("Show on site map", per-zone links in the plan table, `js/views/radar.js`). From the view:
  risks → `#/risks?id=`, permits → `#/permits?id=`, incidents → `#/incidents?id=`, inspections → `#/inspections?id=`,
  sensors → `#/radar`.

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
- Narrow plans (container query ≤ 620 px): names, feature labels and camera codes hide (the table carries them), zone
  codes and badges grow. Camera codes on the plan show for the camera in hand (hover, focus, open) and the selected zone.
- Nothing on the plan animates continuously; hover / selection use short colour transitions (off under reduced motion).

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
  turned back on. Closing the viewer terminates the worker.

## 6. Performance (CDP `Performance.getMetrics`, 1440 × 900, 5 s, headless Chromium, software raster)

| Condition (2 runs each) | TaskDuration ms/s, motion auto | data-motion=reduce |
|---|---|---|
| `#/spatial` zone selected, viewer closed | 11.2 · 11.6 (an earlier run: 8.7 · 8.7) | 7.1 · 7.6 |
| viewer open, first version (feed on the main thread) | 49.9 · 51.6 | 6.2 · 7.2 (still frame) |
| viewer open, shipped (worker + OffscreenCanvas) | 13.9 · 14.2 | 6.3 · 7.1 (still frame) |
| reference `#/risks` (untouched) | 9.9 · 10.0 | 6.7 · 8.0 |
| `#/airisks?risk=AR4` drawer open (row added) | 9.5 · 10.4 (before: 9.6 · 11.3) | 6.8 · 6.9 (before: 5.5 · 6.4) |
| `#/radar` (links added), back-to-back A/B | 405.7 · 431.2 (original file: 415.8 · 429.6) | 153.0 · 153.9 (original: 150.9 · 150.8) |

The shipped viewer adds about 2.5 – 3 ms/s over the closed view in the same run (the once-per-second OSD clock and the
dialog; a stopped feed in an open viewer measures the same as a running one), so the 15 fps frames themselves cost no
main-thread time. The radar route is dominated by its four canvas radars; its run-to-run spread (± 15 ms/s) is larger
than any effect of the two static links. The feed's own draw time (≈ 0.7 – 2 ms per frame) is spent in the worker.

## 7. Tests

`node tests/run.mjs spatial`: camera codes unique and Latin, site / zone exist, scene preset known, plausible optics,
English mirrors; positions inside the plan and inside their own zone; plan features inside the site; sensor markers
inside their zone; zone link counts equal the selector / store counts for every zone of every site, and the zones add
up to the site register; PPE boxes only follow PPE non-compliance events of the zone (Arabic-Indic digits included);
AI-risk map targets.

## 8. Known limits

- Plan geometry (footprints, roads, gates, cranes) is illustrative seed data, not a survey; sensor spots are placements.
- The zone match for PPE events is textual because feed events have no `zoneId`; adding `zoneId` to the engine's feed
  events (A-DATA) would make it structural (the function already prefers `ev.zoneId` when present).
- The HSE register's own drawer (`js/views/risks.js`) has no "Show on site map" button yet (owner B-HSE1); the AI-risk
  drawer and the radar have it, and the spatial view links back into `#/risks?id=`.
- On phones the camera markers are small touch targets; the camera list below the plan has full-size buttons.
