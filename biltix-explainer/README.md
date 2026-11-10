# BILTIX Risk AI — product explainer (Remotion)

A 41.5-second, silent, captioned explainer of the BILTIX Risk AI workflow, rendered in
Arabic (RTL) and English from the app's own demo dataset:

**Data source → Validation → Risk analysis → Explanation → Human approval → Mitigation → Verified closure**

This is an isolated rendering project. The app in `../biltix-hse` stays a static site with
plain ES modules: no React and no build step are added to it. The only files this project
writes into the app are the web exports in `../biltix-hse/assets/video/`.

> ## ⚠️ Licence note: Remotion is not free for every company
>
> Remotion is **free only for individuals and for companies with up to 3 employees**
> (and for non-profits and evaluation). If BILTIX has **more than 3 employees, it needs a
> Remotion company licence** to use Remotion, including to render or re-render this video.
> Check the terms before rendering this video in a company setting:
> **https://www.remotion.dev/license**
>
> The exported MP4/WebP/VTT files contain no Remotion code. The licence applies to using
> Remotion to produce them.

## What changed in the v3.1 recut

- **Light theme first.** The palette is the app's light tokens (`biltix-hse/css/tokens.css`,
  `:root[data-theme="light"]`): app plane `#F4F7FB`, white cards, ink `#132238`, borders
  `#DCE5EF`, brand `#2F6FED`, accent `#0E93AC` (highlights `#19C6E6`), status marks with their
  light text tones. The engineering grid (160 px cells, survey crosses, 3–8 % ink) sits on a far
  layer of the camera, so it drifts with real parallax.
- **Nickel-orange metal edges and the laser comet**, as in the app (`css/components.css`
  "Edges"): every card has the banded metal edge (`src/components/Metal.tsx`), and the card the
  scene is about carries a short glowing comet travelling round its rounded edge at constant
  speed, clockwise in English and counter-clockwise in Arabic. The intro ring, the ingestion hub,
  the closure seal and the outro ring carry the same comet on a circle.
- **Circles instead of lines.** The app's ring gauge with radial weekly bars
  (`js/ui/charts.js` ringGauge) is rebuilt in `src/components/Ring.tsx` and used for the
  consolidated portfolio dial (ring = 79/100, 12 spokes = the 12 weekly consolidated scores) and
  the five category dials (ring = score/100, spokes = each category's 12 weekly scores, the same
  `psel.consolidatedScore` trend the cockpit domain cards use). Sources become radial spokes
  round the ingestion hub (spoke length ∝ records in), validation is an exact donut
  (angle = 360° × count / records in), the KPIs are ratio rings, quarantine is a 14-segment
  ring, the weekly displacement is a 270° gauge with the limit tick, the model drivers are rings
  of their share of the pipeline's total weight (weights sum to 1), the decision timing is a
  60-minute clock, the write-back travels over an arc, and the seven steps close the film on one
  circle round the emblem. The 7-beat step rail became a circular dial in the top bar.
- **Virtual camera** (`src/lib/camera.ts`, `src/components/Stage.tsx`, `src/shots.ts`). The
  world is a 1920 × 1080 plane under CSS perspective (2200 px, about a 50 mm look); layers sit at
  `translateZ(depth)`. Each scene has a short shot list (focus point, dolly, a degree or two of
  orbit) eased with `EASE.cam` / `EASE.soft` from `theme.ts`, so the camera settles on the detail
  being explained and never starts or stops abruptly. `aim()` pushes in by bringing a detail
  toward a chosen screen point, so the frame never runs far off the layout and key text never
  slides under the top bar or the caption (both sit on soft fades of the app plane).
  - **Match cuts**: the intro emblem dissolves into the ingestion hub at the same screen size and
    spot (the comet keeps its angle and angular speed across the cut); the validation ring
    dissolves into the portfolio dial; the closure seal becomes the outro's ring of steps.
    Other scenes dip briefly through the canvas instead of stacking two layouts.
  - **Rack focus**, used twice: in *Explanation* the focus pulls from the risk card to the
    evidence (≤ 3 px blur on the out-of-focus layer, which also sits 40 px deeper), and in
    *Mitigation* from the task to the exclusion zone and write-back.
  - **Site camera**: a hard cut to a procedurally drawn **simulated** CCTV-style frame of the
    story risk's location, full frame, then a pull-back revealing the app's camera viewer with
    its badges (*Simulated*, *Camera not connected*) and the burned-in
    `SIMULATED FEED · NO CAMERA CONNECTED` / `15 FPS SIM` tags (same rules as the app's
    `#/spatial` view, `docs/design/spatial.md`). The picture updates at 15 fps, never mirrors,
    and shows no "live", "REC" or detection-confidence claim. The dashed box over the tension
    cracks is tagged *Illustrative*; the crack length, worker and excavator counts, sensor and
    photo references come from the data. The scene itself is drawn by hand (not a recording or
    a survey). If the app ships a camera record for the risk's zone
    (`js/data/spatial-seed.js`), `extract-data.mjs` picks its code up; otherwise the OSD names
    the site only.
- **Honesty fixes from the current dataset**: sources are "data sources" tagged
  *Demo feeds · not connected* (never "connected"); the escalation reads *routed · not sent*
  (the dataset: "routing only, not sent in this release"); the write-back is tagged
  *Simulated* with "No real connection to BILTIX PM in this version". The extractor now fails if
  the dataset stops marking either as routed-only / simulated, and checks that the matrix counts
  per colour equal the rating distribution printed in its legend.
- No glyph the bundled IBM Plex fonts lack (→ ← ↔ ≥ ≤ ≈ ₂ σ Δ ✓ ✕) is used in the copy: the
  matrix legend uses ranges (`70–100`, `40–69`, `0–39`), axis arrows are gone, ticks are drawn.

## What is in the video (41.5 s, 1,245 frames at 30 fps)

| Beat | Frames | On screen (all values come from `src/data.json`) |
|---|---|---|
| Intro | 0–71 | Emblem with a metal dial ring and comet, wordmark |
| 01 Data source | 72–197 | 13 sources as radial spokes round the ingestion hub, top six listed with records, records today, last batch |
| 02 Validation | 198–323 | Exact donut (passed / duplicates / rejected) with a scan head, pass rate, completeness, consistency rings, quarantine 7 of 14 |
| 03 Risk analysis | 324–488 | Portfolio dial 79/100 with 12 weekly spokes, five category dials with weekly spokes, 5×5 likelihood × impact matrix of the 58 open AI risks, counts per rating |
| 04 Explanation | 489–644 | `AIR-1020`: score = 5 × 5 × 4 = 100, explanation, confidence (*Illustrative*), driver rings (*Illustrative weights*), weekly displacement gauge (14 vs limit 5 mm, 2.8×), cumulative 41 mm, schematic section |
| 04 Site camera | 645–734 | Simulated CCTV-style frame of the north excavation face inside the app's viewer (*Simulated*, *Camera not connected*) |
| 05 Human approval | 735–872 | Recommendation, expected impact 100 → ~30, effort, rationale, the reviewer accepts; decision clock 0 → +5 (routed) → +22 (acknowledged) → +40 min (decision) from the real timestamps |
| 06 Mitigation | 873–1004 | Task `MT-0214`, owner, due, PM impact, controls ring 2 of 4 (done / ongoing from the risk history), exclusion zone, simulated write-back to BILTIX PM |
| 07 Verified closure | 1005–1157 | The risk's real audit trail, then the verified-closure seal (*Illustrative end state*) |
| Outro | 1158–1244 | The seven steps on one ring round the emblem |

Honesty notes:
- Every frame carries the **بيانات توضيحية / Demo data** label.
- No model-accuracy figures are shown. The dataset marks pipeline precision, recall,
  calibration and drift as not measured, so they are never extracted. The per-risk confidence
  and the driver weights are tagged as illustrative, the same way the app tags demo metrics.
- In the dataset, `AIR-1020` is still being treated, so the closure row and the seal are
  flagged on screen as **حالة ختامية توضيحية / Illustrative end state**. The target score
  shown (`~30`) is the recommendation's own "expected impact" text.
- The slope cross-sections and the camera picture are labelled schematic / simulated; only the
  annotated quantities come from the data.
- English copy for the story risk is written in `scripts/extract-data.mjs` (`EN_STORY`), with
  every number interpolated from the Arabic source text. Enum labels come from the app's own
  `js/i18n/enums.js` when present.

## Requirements

- Node ≥ 22.18. The VTT writer imports `src/storyboard.ts` through Node's type stripping.
- A Chromium for rendering. Remotion normally downloads Chrome Headless Shell from Google
  storage. That host is blocked in the build sandbox, so `remotion.config.ts` and
  `scripts/env.mjs` use a preinstalled browser:
  `/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`.
  To use another browser, set `REMOTION_BROWSER=/path/to/chrome-headless-shell`.
- ffmpeg/ffprobe come from Remotion's compositor package (`@remotion/compositor-*`). No
  system ffmpeg is needed. The review contact sheet uses `python3` + Pillow (optional).

```bash
npm ci
```

## 1. Extract the data

```bash
npm run extract          # node scripts/extract-data.mjs  →  src/data.json
# options: --risk AIR-1020 (story risk) · BILTIX_APP_DIR=/path/to/biltix-hse
```

The script imports the app's pure modules (`js/data/platform-seed.js`, `js/data/seed.js`,
`js/core/platform-selectors.js`, `js/core/selectors.js`, `js/i18n/enums.js`, and
`js/data/spatial-seed.js` if present). It builds the same state shape that `store.js` hands to
the selectors and fixes "now" to the dataset anchor day (2026-11-09 12:00), so the output is
reproducible. It writes the consolidated score, rating and 12-week trend, the five category
scores with their 12-week trends, the rating distribution, the 5×5 heatmap of the open AI risks
(checked: score = L × I × 4, cells add up to the open-risk count, colour counts = rating
distribution), the validation summary, and the story risk (explanation, evidence, drivers,
recommendation, controls, task, alert, reviewer, timeline, audit rows, optional site camera).

The script fails loudly when the data drifts (a regex no longer finds a number, an English label
is missing, totals don't add up, a trend is missing, or a routed-only / simulated flag is gone).
It never renders stale or invented values. After any change to `biltix-hse/js/data/*` run
`npm run build` again.

## 2. Preview

```bash
npx remotion studio      # or: npm run studio
```

Pick `ExplainerAR` or `ExplainerEN`. Timing and captions live in `src/storyboard.ts`, camera paths
in `src/shots.ts`, copy in `src/copy.ts`, the palette, easing and lens in `src/theme.ts`, and each
beat in `src/scenes/`.

## 3. Render both languages (1080p masters)

```bash
npm run render:ar -- --concurrency=4     # out/biltix-explainer-ar-1080p.mp4
npm run render:en -- --concurrency=4     # out/biltix-explainer-en-1080p.mp4
```

`remotion.config.ts` sets H.264, yuv420p, CRF 20, x264 `slow` and PNG intermediate frames. The
output is 1920×1080, 30 fps, 1,245 frames (41.5 s), silent. On the 4-core build sandbox, shared
with other jobs, one language takes about 13 minutes (see "Last build" below); lower
`--concurrency` when the machine is busy.

## 4. Captions and web exports

```bash
npm run captions         # → ../biltix-hse/assets/video/explainer-{ar,en}.vtt
npm run export:web       # → ../biltix-hse/assets/video/explainer-{ar,en}-720p.mp4 + -poster.webp
```

- `write-captions.mjs` uses the same `captionCues()` and caption copy as the compositions. It
  rejects any cue over 9 words or shorter than 1.6 s (the shortest cue is 1.9 s).
- `export-web.mjs` remuxes the masters with `+faststart`, encodes 1280×720 H.264 (High@4.0,
  yuv420p, faststart, no audio track), raising the CRF from 24 until each file is ≤ 3.3 MiB (at or
  below the earlier cut's web files), and renders a
  1280×720 WebP poster (frame 420: the portfolio dial, category dials and matrix), < 120 KB.

One command for everything: `npm run build` (extract → captions → render → export:web).

## 5. Review stills

```bash
npm run stills           # 12 stills per language + out/contact/<lang>-sheet.png
node scripts/contact-sheet.mjs --lang ar --frames 560,690
```

## Last build

2026-11-10, data extracted from this tree's `biltix-hse` (anchor day 2026-11-09). 4-core build
sandbox shared with other jobs (load average about 6 during the renders), `--concurrency=4`,
PNG frames, CRF 20, x264 `slow`:

| Step | Time | Output |
|---|---|---|
| `render:ar` | 771 s | `out/biltix-explainer-ar-1080p.mp4` 11,579,131 B (1920×1080, 1,245 frames, 41.5 s, H.264 High, no audio) |
| `render:en` | 761 s | `out/biltix-explainer-en-1080p.mp4` 12,182,626 B |
| `export:web` (both) | 80 s | `explainer-ar-720p.mp4` 3,196,167 B (CRF 25) · `explainer-en-720p.mp4` 3,428,511 B (CRF 25) · posters 46,634 B / 49,752 B |
| `captions` | < 1 s | `explainer-ar.vtt` 1,317 B · `explainer-en.vtt` 1,026 B (10 cues each, shortest 1.9 s) |
| `stills` | 27 s | `out/contact/{ar,en}-sheet.png` + 12 stills per language |

The earlier static cut's web files were 3,106,141 B (ar) and 3,437,302 B (en). The moving camera
changes every frame, so the 1080p masters grew from 8.8 / 9.4 MB to 11.6 / 12.2 MB; the web files
stay within 3 % of the old ones.

## In the app

The cockpit's "How the platform works" dialog (`biltix-hse/js/views/cockpit.js`,
`openExplainer`) embeds these files: poster, `preload="none"`, playback only on the viewer's
click, captions in the page language by default with a switch to the other version, no audio
track. The file names are unchanged and the duration is read from the video's metadata, so the
recut needs no embed change.

## Project layout

```
remotion.config.ts        CLI config (browser, codec, CRF, pixel format)
scripts/extract-data.mjs  dataset → src/data.json
scripts/write-captions.mjs  storyboard → WebVTT
scripts/export-web.mjs    720p web encodes + WebP posters + faststart remux
scripts/contact-sheet.mjs review stills (scripts/sheet.py tiles them)
scripts/env.mjs           browser + bundled ffmpeg discovery for the Node scripts
src/storyboard.ts         timing, transitions, step labels, captions (single source of truth)
src/shots.ts              the camera's shot list per scene
src/Explainer.tsx         composition (RTL/LTR), far background plate, scenes, HUD
src/lib/camera.ts         virtual camera: shot interpolation, mirroring, world transform
src/components/Stage.tsx  perspective stage, depth layers (rack focus), scene dissolves
src/components/Metal.tsx  metal-edge cards, laser comet, metal rings
src/components/Ring.tsx   ring gauge with radial weekly bars, exact donut
src/components/Chrome.tsx background plate, HUD (top bar, step dial, caption band), chips
src/scenes/*.tsx          the ten beats (SiteCam.tsx = the simulated camera)
```
