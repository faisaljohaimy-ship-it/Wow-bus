# BILTIX Risk AI — product explainer (Remotion)

A 41-second, silent, captioned explainer of the BILTIX Risk AI workflow, rendered in
Arabic (RTL) and English from the app's own demo dataset:

**Data source → Validation → Risk analysis → Explanation → Human approval → Mitigation → Verified closure**

This is an isolated rendering project. The app in `../biltix-hse` stays a static site with
plain ES modules: no React and no build step are added to it. The only files this project
writes into the app are the web exports in `../biltix-hse/assets/video/`.

> ## ⚠️ License note: Remotion is not free for every company
>
> Remotion is **free only for individuals and for companies with up to 3 employees**
> (and for non-profits and evaluation). A company with **more than 3 employees needs a
> Remotion company license** to use Remotion, including to render this video.
> Check the terms before rendering this video in a company setting:
> **https://www.remotion.dev/license**
>
> The exported MP4/WebP/VTT files contain no Remotion code. The license applies to using
> Remotion to produce them.

## What is in the video

| Beat | On screen (all values come from `src/data.json`) |
|---|---|
| Intro | BILTIX emblem + wordmark |
| 01 Data source | Validation sources ranked by records, ingestion hub, records captured today |
| 02 Validation | Exact proportional bar (passed / duplicates / rejected) with a ×4 magnifier, pass rate, completeness, consistency, quarantine |
| 03 Risk analysis | Consolidated portfolio gauge (B2 thresholds), five category scores, rating split, **5×5 likelihood × impact matrix of the open AI risks** |
| 04 Explanation | Story risk `AIR-1020`: score = likelihood × impact × 4, plain-language explanation, model drivers (site-AI feature weights), sensor evidence (weekly rate vs limit, cumulative), schematic section |
| 05 Human approval | Model recommendation, rationale, expected impact, reviewer, real decision timestamps |
| 06 Mitigation | Task `MT-0214`, owner, due date, PM impact, controls (done/ongoing from the risk history), exclusion zone, write-back to Biltix PM |
| 07 Verified closure | The risk's real audit trail, then a verified-closure seal |

Honesty notes:
- Every frame carries the **بيانات توضيحية / Demo data** label.
- In the dataset, `AIR-1020` is still being treated, so the closure row and the seal are
  flagged on screen as **حالة ختامية توضيحية / Illustrative end state**. The target score
  shown (`~30`) is the recommendation's own "expected impact" text.
- The slope cross-sections are labelled as schematics. The terrain outline is drawn by hand.
  The annotated quantities (crack offset, worker and excavator counts, exclusion radius) come
  from the data.
- English copy for the story risk is written in `scripts/extract-data.mjs` (`EN_STORY`), with
  every number interpolated from the Arabic source text. Enum labels (categories, ratings,
  roles, source systems, effort…) come from the app's own `js/i18n/enums.js` when present.

## Requirements

- Node ≥ 22.18. The VTT writer imports `src/storyboard.ts` through Node's type stripping.
- A Chromium for rendering. Remotion normally downloads Chrome Headless Shell from Google
  storage. That host is blocked in the build sandbox, so `remotion.config.ts` and
  `scripts/env.mjs` use a preinstalled browser:
  `/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`.
  To use another browser, set `REMOTION_BROWSER=/path/to/chrome-headless-shell`.
- ffmpeg/ffprobe come from Remotion's compositor package (`@remotion/compositor-*`). No
  system ffmpeg is needed. That build is minimal, with no overlay or xstack filters, so the
  review contact sheet uses `python3` + Pillow. The sheet is optional.

```bash
npm ci
```

## 1. Extract the data

```bash
npm run extract          # node scripts/extract-data.mjs  →  src/data.json
# options: --risk AIR-1020 (story risk) · BILTIX_APP_DIR=/path/to/biltix-hse
```

The script imports the app's pure modules (`js/data/platform-seed.js`, `js/data/seed.js`,
`js/core/platform-selectors.js`, `js/core/selectors.js`, and `js/i18n/enums.js` if present).
It builds the same state shape that `store.js` hands to the selectors:
`{ sites, platform, settings: { platform: { weights } }, filters: { siteId: 'all', range: 30, search: '' } }`.
"Now" is fixed to the dataset anchor day (2026-11-09 12:00) so the output is reproducible.

It writes:
- the consolidated score and rating, five category scores, and the rating distribution
- the 5×5 heatmap. When the AI risks carry `likelihood`/`impact` (v3 data), it is counted
  from the open AI risks. The script also checks that score = L × I × 4 and that the cells add
  up to the open-risk count. With older data it falls back to the HSE register's
  likelihood × severity matrix, plus a score-band `severityDistribution` (see the comment in
  the script).
- the validation summary (records in/passed/rejected/deduplicated, pass rate, completeness,
  consistency, quarantine, rules, per-source counts)
- the story risk: code, title, explanation, evidence source and excerpt, recommendation and
  rationale, drivers, controls, task, alert, reviewer, timeline and audit-log rows

The script fails loudly when the data drifts, for example when a regex no longer finds a
number, an English label is missing, or the totals don't add up. It never renders stale or
invented values.

## 2. Preview

```bash
npx remotion studio      # or: npm run studio
```

Pick `ExplainerAR` or `ExplainerEN`. Timing and captions live in `src/storyboard.ts`. Copy is
in `src/copy.ts`, the palette and easing in `src/theme.ts`, and each beat in `src/scenes/`.

## 3. Render both languages (1080p masters)

```bash
npx remotion render src/index.ts ExplainerAR out/biltix-explainer-ar-1080p.mp4 --concurrency=4
npx remotion render src/index.ts ExplainerEN out/biltix-explainer-en-1080p.mp4 --concurrency=4
# or: npm run render
```

`remotion.config.ts` sets H.264, yuv420p, CRF 20, x264 `slow` and PNG intermediate frames
(no JPEG ringing on the 2–4 % blueprint grid). The output is 1920×1080, 30 fps, 1,230 frames
(41.0 s) and silent.

## 4. Captions and web exports

```bash
npm run captions         # → ../biltix-hse/assets/video/explainer-{ar,en}.vtt
npm run export:web       # → ../biltix-hse/assets/video/explainer-{ar,en}-720p.mp4 + -poster.webp
```

- `write-captions.mjs` uses the same `captionCues()` and caption copy as the compositions. It
  rejects any cue over 9 words or shorter than 1.6 s.
- `export-web.mjs` remuxes the masters with `+faststart`. It then encodes 1280×720 H.264
  (High@4.0, yuv420p, faststart, no audio track), raising the CRF until each file is ≤ 3.5 MB.
  Finally it renders a 1280×720 WebP poster (frame 505, the risk-analysis beat), lowering the
  quality until the poster is < 120 KB.

One command for everything: `npm run build` (extract → captions → render → export:web).

## 5. Review stills

```bash
npm run stills           # 12 stills per language + out/contact/<lang>-sheet.png
node scripts/contact-sheet.mjs --lang ar --frames 440,690
```

## Using the web files in the app (suggestion, not wired)

```html
<video controls preload="none" playsinline muted
       poster="assets/video/explainer-ar-poster.webp" width="1280" height="720">
  <source src="assets/video/explainer-ar-720p.mp4" type="video/mp4">
  <track kind="captions" src="assets/video/explainer-ar.vtt" srclang="ar" label="العربية" default>
</video>
```

The video is silent by design. The burned-in captions carry the message, and the VTT track
gives screen readers and caption UIs the same text at the same times.

## Project layout

```
remotion.config.ts      CLI config (browser, codec, CRF, pixel format)
scripts/extract-data.mjs  dataset → src/data.json
scripts/write-captions.mjs  storyboard → WebVTT
scripts/export-web.mjs   720p web encodes + WebP posters + faststart remux
scripts/contact-sheet.mjs  review stills (scripts/sheet.py tiles them)
scripts/env.mjs          browser + bundled ffmpeg discovery for the Node scripts
src/storyboard.ts        timing, step labels, captions (single source of truth)
src/Explainer.tsx        composition (RTL/LTR), persistent chrome, scene sequencing
src/scenes/*.tsx         the nine beats
src/components/*.tsx     chrome, gauge, schematic section, seal, emblem, bits
```
