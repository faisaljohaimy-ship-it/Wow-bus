# BILTIX Risk AI — product explainer (Remotion)

A 41.5-second, captioned explainer of the BILTIX Risk AI workflow, rendered (silent) in
Arabic (RTL) and English from the app's own demo dataset, with an optional AI-generated
voice-over muxed on afterwards (see "7. AI narration"):

**Data source → Validation → Risk analysis → Explanation → Human approval → Mitigation → Verified closure**

This is an isolated rendering project. The app in `../biltix-hse` stays a static site with
plain ES modules: no React and no build step are added to it. The only files this project
writes into the app are the web exports in `../biltix-hse/assets/video/` and their media
manifest, `../biltix-hse/js/data/explainer-media.js`.

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

## Fixes after the v3.1 review

An independent check of the published v3.1 recut found single-frame drop-outs, an English honesty
tag in the Arabic camera feed, frames without the demo-data label, key text under the top-bar fade,
an untagged write-back and an embed whose caption track was on by default over the burned-in
captions. All are fixed in the code and both languages were re-rendered ("Last build" below).

- **Single-frame drop-outs: cause and fix.** The first v3.1 masters had frames where part of the
  picture vanished for exactly one frame: English 233 (the whole validation scene), 765 (the top
  ~430 px of both approval cards), 811 and 813 (the Accept / Edit / Dismiss row; found by the same
  detectors) and 902 (the upper `MT-0214` card); Arabic 44 (the intro emblem and wordmark), 112 (the
  data-sources card) and 345 (the risk-analysis content). The camera was built with CSS 3D
  (`perspective` on the stage, `preserve-3d` and `translate3d … rotateY` on the world, `translateZ`
  on every depth plane), so Chromium composited each scene as a 3D rendering context of several
  full-frame planes, and on rare frames Remotion's screenshot (`Page.captureScreenshot` of the
  compositor surface, four tabs in parallel) caught some of those planes with raster tiles not
  drawn. The evidence: the holes are rectangles and full-width bands on raster-tile boundaries; only
  the scenes' depth planes ever lose content (the 2D top bar and caption band, and the background
  plate, never did); and it does not repeat: rendering frames 228–238 again gives a clean 233, and a
  full re-render of the unchanged English composition on the same machine dropped tiles at mostly
  other frames (372, 622, 812, 1095, 1120: about one frame in 250). The camera maths was ruled out:
  camera states, plane matrices and dissolve opacities are finite and in range on every frame of
  every scene in both languages, the drop-outs sit mid-shot rather than at cuts, and the fonts are
  loaded before the first frame (`delayRender` in `src/fonts.ts`); no image or async state is
  involved. **Fix:** `src/lib/camera.ts` now projects each depth plane itself (same 2200 px lens,
  same rotation order, same parallax) and `src/components/Stage.tsx` gives each plane one 2D
  `matrix()`. No `perspective`, `preserve-3d` or `translateZ` is left, so there is no 3D context for
  Chromium to composite. The ≤ 1.6° orbit keeps its parallax and loses only its keystone (a few px
  at the frame corners): six sample frames rendered with the old and the new camera differ by
  0.3–0.6 grey levels on average (2.4 on a rack-focus frame, where the blurred plane sits a few px
  over). Every frame of both new masters and both web files was checked with
  `scripts/check-frames.py` (three drop-out detectors and the chip check): no drop-out, and the
  chip on every frame (see "Last build"). The same script finds every drop-out listed above in
  the v3.1 files.
- **Arabic honesty tag.** The Arabic feed's OSD reads `بث محاكى · لا كاميرا متصلة`, the app's own
  wording (`biltix-hse/js/i18n/spatial.js`), set in IBM Plex Sans Arabic with no letter-spacing
  (letter-spacing breaks Arabic joining) and isolated right-to-left inside the left-to-right OSD
  block. The zone line is isolated the same way, so every OSD line starts at the same edge as the
  camera name above it (the picture and its OSD never mirror).
- **Demo data on every frame.** The chip no longer fades with the top bar: it is on screen at full
  opacity from frame 0 of the intro, through the full-frame simulated feed (the feed's OSD now sits
  60 px below the feed's top edge, so the chip never covers it), to the last frame of the outro.
- **Framing.** The Approve push-in is gentler and centred (magnification about 1.045 instead of
  1.07), so "Model recommendation · AIR-1020" and "Reviewer" stay below the top-bar fade and the
  reviewer card stays inside the frame; the Mitigation end keeps the "Exclusion zone" heading clear
  of the fade. The same rule fixed the end of Explanation (the evidence heading), the end of Risk
  analysis (the portfolio card's text left the frame and the matrix legend sat in the caption
  band), the Verified-closure tilt (its heading) and the validation → portfolio match point. Arabic
  mirrors every shot. `npm run check:framing` projects every card's heading and key text through
  the camera for every frame of both languages; the only allowed exits are named in the script
  (the far ring gauges and the entering matrix during the validation → portfolio match).
- **Write-back.** The *Simulated* tag and "No real connection to BILTIX PM in this version" are
  part of the write-back card, so they are on screen whenever the arc is: the card fades in from
  frame 903, is fully opaque from 927 to 1004 (2.6 s) and dissolves out with the scene by 1015
  (3.7 s in all). Before, the arc ran untagged from about frame 913 to 965 and the note was
  readable for about 1.2 s.
- **Embed.** The caption track is offered but off by default (see "In the app").

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
  world is a stack of flat 1920 × 1080 planes at depths (px toward the viewer), seen through a
  2200 px pinhole lens (about a 50 mm look). The projection is computed in JS and every plane gets
  one plain 2D `matrix()` (see "Fixes after the v3.1 review" for why it is no longer CSS 3D).
  Each scene has a short shot list (focus point, dolly, a degree or two of orbit) eased with
  `EASE.cam` / `EASE.soft` from `theme.ts`, so the camera settles on the detail being explained
  and never starts or stops abruptly. `aim()` / `aimY()` push in by bringing a detail toward a
  chosen screen point, and `npm run check:framing` proves for every frame, in both languages,
  that no card heading or key text goes under the top bar's fade, into the caption band or out
  of the frame.
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
    `SIMULATED FEED · NO CAMERA CONNECTED` (Arabic: `بث محاكى · لا كاميرا متصلة`, the app's own
    wording) / `15 FPS SIM` tags (same rules as the app's
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
- Every frame carries the **بيانات توضيحية / Demo data** label, at full opacity and at the same
  spot (top bar, inline-end), from frame 0 of the intro through the full-frame simulated camera
  feed to the last frame of the outro.
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
  system ffmpeg is needed. The review contact sheet uses `python3` + Pillow (optional); the frame
  check (`scripts/check-frames.py`) uses `python3` + numpy and an `ffmpeg`/`ffprobe` on `PATH`
  (or set `FFMPEG` / `FFPROBE`).

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
with other jobs, one language takes 13 to 37 minutes depending on the load (see "Last build"
below); lower `--concurrency` when the machine is busy. The Chromium compositor can crash under
memory pressure ("The browser crashed while rendering frame …"); Remotion retries the frame in a
new browser, and a lower concurrency avoids it.

## 4. Captions and web exports

```bash
npm run captions         # → ../biltix-hse/assets/video/explainer-{ar,en}.vtt
npm run export:web       # → ../biltix-hse/assets/video/explainer-{ar,en}-720p.mp4 + -poster.webp
```

- `write-captions.mjs` uses the same `captionCues()` and caption copy as the compositions. It
  rejects any cue over 9 words or shorter than 1.6 s (the shortest cue is 1.9 s).
- `export-web.mjs` remuxes a freshly rendered master with `+faststart`, encodes 1280×720 H.264
  (High@4.0, yuv420p, faststart), raising the CRF from 24 until each file is ≤ 3.3 MiB (about the
  size of the larger of the earlier static cut's web files, 3.4 MB), renders a
  1280×720 WebP poster (frame 420: the portfolio dial, category dials and matrix), < 120 KB, and
  writes the app's media manifest `../biltix-hse/js/data/explainer-media.js` (per language: the
  files, size, duration, `voice` and the ten cues). When a narration record exists
  (`out/voice/<lang>.json`, written by `npm run voice`), it muxes that narration again with the
  same code instead of the silent 720p encode (≤ 3.7 MiB with the audio track), so a full
  rebuild keeps the voice; without it the language is exported silent and `voice` is `null`.
- `scripts/lib/story.mjs` builds the cue list, the VTT text and the manifest for all three
  scripts, so the VTT files, the manifest and the narration placement never disagree.

One command for everything: `npm run build` (extract → captions → render → export:web).

## 5. Review stills

```bash
npm run stills           # 12 stills per language + out/contact/<lang>-sheet.png
node scripts/contact-sheet.mjs --lang ar --frames 560,690
```

## 6. Check every frame

```bash
npm run check:framing    # key text vs the top-bar fade, the caption band and the frame edges (camera maths)
npm run check:frames     # python3 scripts/check-frames.py: drop-outs + Demo-data chip, every frame of the
                         # two masters and the two web files (exit 1 on any finding)
```

`check-frames.py` compares each frame (scaled to 480 × 270, grey) with its two neighbours as a
whole, in three horizontal bands and in an 8 × 6 tile grid. A one-frame hole (a card or a scene
missing for one frame) fails all three. A tile flag is dismissed, and listed as dismissed, only
when the frame lies between its neighbours (a dissolve, or an edge sliding across a tile
boundary) or when the tile keeps its detail while its neighbours also differ (the rolling record
counter). It also checks that the inside of the Demo-data pill is on every frame. Run it after
every render: the drop-outs it guards against were intermittent.

## 7. AI narration

The explainer can carry an **AI-generated voice-over**, muxed onto the rendered videos without
re-rendering or retiming a single frame. Without it the videos stay silent and captioned.

### Honesty

- **The voice is synthetic.** It is text-to-speech from **ElevenLabs** (model
  `eleven_multilingual_v2`), using two voices from ElevenLabs' voice library: Arabic
  "Saadoun Professional Voice" (a Saudi narrator voice) and English "Ryan - American Documentary
  Narrator". It is not a recording of anyone at BILTIX.
- **It says only what the captions say.** The narration script is the ten captions of
  `src/storyboard.ts`, in order and word for word; only `{sources}` (13) is read as a word. So the
  captions' honesty rules (demo data, demo feeds that are not connected, a simulated camera, a
  human reviewer deciding) hold for the voice too, and the burned-in captions stay a full
  transcript.
- **It is labelled.** The app's media manifest (`../biltix-hse/js/data/explainer-media.js`) gives
  each language `voice: { name, provider, model }`, or `null` when that language is silent, so
  the app can say "AI-generated voice (ElevenLabs)". `voice-mux.mjs` has no default labels: the
  voice name, provider and model must be given on the command line.
- Before publishing, check that the ElevenLabs plan the files were generated on allows commercial
  use of the audio.

### Narration script

Generate **one file per language** with the lines below in order, separated by
`<break time="1.2s"/>` (no other long pauses). MP3 or WAV; any sample rate.

| # | Scene | Arabic (spoken) | English (spoken) |
|---|---|---|---|
| 1 | intro | من البيانات الخام إلى إغلاق موثّق | From raw data to verified closure |
| 2 | source | ثلاثةَ عشرَ مصدراً للبيانات في مسار استيعاب واحد | Thirteen data sources flow into one pipeline |
| 3 | validate | كل سجل يُتحقَّق منه قبل التحليل | Every record is validated before analysis |
| 4 | analyze | الذكاء الاصطناعي يقيّم المخاطر عبر خمس فئات | AI scores risk across five categories |
| 5 | explain | كل درجة مدعومة بتفسير ودليل من المصدر | Every score is explained, with source evidence |
| 6 | sitecam | كاميرا موقع محاكاة تربط الدليل بمكانه | A simulated site camera ties evidence to place |
| 7 | approve | القرار للمراجع البشري، لا للنموذج | A human reviewer makes the call |
| 8 | mitigate | التوصية المعتمدة تصبح مهمة معالجة متتبَّعة | Approved actions become tracked mitigation tasks |
| 9 | close | سجل تدقيق كامل حتى الإغلاق الموثّق | A full audit trail to verified closure |
| 10 | outro | قرارات مدعومة بالدليل، بإشراف بشري | Evidence-backed decisions, with humans in control |

`scripts/lib/story.mjs` (`narrationScript`) builds this table from the storyboard; if the
captions or the source count change, regenerate the audio.

### Run it

```bash
# report only: split, letter-share check, placement table, loudness, placement check; writes nothing
npm run voice -- --ar /path/to/narration-ar.mp3 --en /path/to/narration-en.mp3 \
  --ar-voice "Saadoun" --en-voice "Ryan" --provider ElevenLabs --model eleven_multilingual_v2 --dry-run

# the same without --dry-run writes the files below (one language at a time works too)
npm run voice -- --ar /path/to/narration-ar.mp3 --en /path/to/narration-en.mp3 \
  --ar-voice "Saadoun" --en-voice "Ryan" --provider ElevenLabs --model eleven_multilingual_v2
```

| Written | What |
|---|---|
| `out/biltix-explainer-<lang>-1080p.mp4` | master with the narration; video stream copied (re-encoded with the render settings, CRF 20, only when the tail is extended) |
| `out/biltix-explainer-<lang>-1080p-silent.mp4` | the silent original, kept next to it (never in the web assets) |
| `out/voice/<lang>.json`, `out/voice/<lang>.mp3` | the narration file and its labels, so a rebuild can mux it again; `out/voice/report-<lang>.txt` is the run's report |
| `../biltix-hse/assets/video/explainer-<lang>-720p.mp4` | web file with the narration: the same 720p encode as before, CRF raised from 24 until the file with audio is ≤ 3.7 MiB |
| `../biltix-hse/assets/video/explainer-<lang>.vtt` | cues unchanged, unless the tail was extended and the last line speaks past the last cue (its end then moves to the line's end + 0.1 s) |
| `../biltix-hse/js/data/explainer-media.js` | manifest: per language the files, 1280×720, the real duration, `voice`, the ten cues (`id`, `start`, `end`, `step`, `text`) |

`--out-dir <dir>` writes the same tree under `<dir>` instead (the silent masters are still read
from `out/`). Tuning, if a real file needs it: `--min-pause` (0.6 s), `--silence-db` (−45),
`--share-tolerance` (1.6), `--web-crf` (first CRF tried, 24), `--keep-temp`.

### What it does

1. **Lines.** Decodes the file to 48 kHz mono, finds every silence of ≥ 0.2 s under −45 dBFS
   (ffmpeg `silencedetect`) and splits at the **9 longest pauses of ≥ 0.6 s** (lead and trail
   silence excluded). Fewer than 9 → it stops and lists the longest silences it found. Each line's
   length is then checked against its share of the script by letter count (harakat not counted,
   13 counted as spoken): a line outside ×/÷ 1.6 of its share stops the run with the lines named
   (a missed break or a comma pause taken for one shows up as one line too long and one too short).
2. **Placement** in the line's scene window, from the cue list of `captionCues()`:
   - preferred start = the cue start, never within 0.15 s of the previous line's end;
   - each line ends ≥ 0.12 s before the next cue starts (the last line: ≥ 0.4 s before the video ends);
   - too long → it starts earlier, as late as fits, but not before scene start − the 0.5 s dissolve
     (scene start after the hard cut into the site camera) and not within 0.15 s of the previous line;
   - still too long → it starts there and is sped up with `atempo` (≤ 1.08);
   - the last line still too long → the video's tail is extended by holding its last frame for
     (line end − video end) + 0.4 s, in whole frames; the masters are re-encoded only then.
   Every adjustment is listed in the report's placement table. Scenes are never retimed: a middle
   line that cannot fit even at 1.08 stops the run (regenerate that line a little faster).
3. **Edges.** Each line keeps 40 ms before its onset and 80 ms after its end, with raised-cosine
   fades (20 ms in, 30 ms out); between lines the track is digital silence.
4. **Loudness**, two-pass `loudnorm`: pass 1 measures; if a plain gain to **−16 LUFS** would take
   the true peak above −2.0 dBTP (the −1.5 dBTP limit minus 0.5 dB of headroom for the AAC
   encode), a look-ahead true-peak limiter (4× oversampled peaks, 5 ms look-ahead, 80 ms
   release) trims only those peaks first; pass 2 applies the gain in linear mode. The track is
   AAC-LC, 48 kHz, mono, 128 kb/s. The decoded AAC is measured again: it must read −16 ±0.5 LUFS
   and ≤ −1.5 dBTP (if the codec overshoots, the ceiling is lowered and the pass repeated).
5. **Self-checks** before anything is written: in the decoded track, every line's onset and end
   within 0.15 s of the plan (and lines kept at their cue within 0.15 s of the cue). After writing:
   both files have a 48 kHz AAC track as long as the video (±0.05 s) and the expected frame count.

Only the ffmpeg/ffprobe bundled with Remotion (`@remotion/compositor-*`, via `scripts/env.mjs`)
are used; that build has no `afade`, `tpad` or `ebur128`, so the fades and the limiter are done
in JavaScript (`scripts/lib/narration.mjs`), the held tail frame is the exact last frame looped
(`concat`), and loudness is read from `loudnorm`'s own measurement.

### Rebuilds and going back to silent

`npm run export:web` (and so `npm run build`) re-applies a recorded narration with the same code:
after a re-render the new master is silent, becomes the `-silent.mp4`, and the narration is
muxed onto it again; the manifest is rewritten either way. To remove a language's voice, delete
`out/voice/<lang>.json` and run `npm run export:web -- --lang <lang>`: the master is restored from
its `-silent.mp4`, the web file is encoded silent (≤ 3.3 MiB), the VTT is rewritten from the
storyboard and the manifest says `voice: null`.

### Proof with a synthetic narration (2026-11-11, before the real files arrived)

The pipeline was run end to end on **synthetic test signals**, not on the real voices:
`tests/synth-narration.mjs` writes speech-like bursts (voiced harmonics with syllable envelopes,
1.6–3.4 s per line, a 0.25 s comma gap inside lines 2 and 5, 1.2 s pauses, 0.3 s lead and trail,
a −70 dBFS noise floor) as 44.1 kHz mono MP3, like the provider's files. Arabic line 1 was made
long enough to need an earlier start, English line 6 to need `atempo`, English line 10 to need the
tail rule. Results (`--out-dir` in the build sandbox; nothing in the repository was touched):

| | Arabic (synthetic) | English (synthetic) |
|---|---|---|
| Adjustments | intro −0.339 s earlier; source +0.030 s (0.15 s after intro); outro −0.208 s earlier | sitecam −0.267 s earlier + atempo 1.0407; approve +0.030 s; outro −0.833 s earlier + atempo 1.08 (cap) + tail +5 frames (0.167 s) → 41.667 s, last cue end 41.300 → 41.338 s |
| Placement in the written web file (system ffmpeg `silencedetect`) | worst 0.005 s from plan; the 7 lines at their cue: 0.000 s | worst 0.008 s from plan; the 7 lines at their cue: 0.000 s |
| Loudness (system ffmpeg 6.1 `ebur128`, both files) | −16.0 LUFS, true peak −1.9 dBTP | −16.0 LUFS, true peak −1.8 dBTP |
| 1080p master | 11,739,740 B, video stream-copied, 41.500 s | 12,245,775 B, re-encoded CRF 20, 1,250 frames; first 1,245 frames vs the silent master PSNR Y 49.7 dB (min 45.8), held frames vs the last frame 53.6 dB |
| 720p web file | 3,599,094 B (CRF 26) | 3,827,381 B (CRF 26; budget 3,879,731 B) |

The run (both languages, including the 720p CRF steps and the English 1080p re-encode) took 3 min 17 s on the shared 4-core sandbox (load average 9 to 11). In a copy of the tree,
`npm run export:web` then re-applied both recorded narrations (Arabic from a silent master, as
after a re-render; English from its `-silent.mp4`) and wrote masters, web files, VTT and manifest
byte-identical to `voice-mux.mjs`'s; with `out/voice/en.json` removed, `export:web -- --lang en`
restored the silent master and reproduced the committed silent web file and poster byte for byte,
with `voice: null` for English in the manifest. Unit tests:
`npm test` (23 tests: silence parsing, speech bounds, splitting and the wrong-pause-count error, letter shares,
placement incl. earlier start, the 0.15 s and dissolve floors, atempo and its cap, the tail rule,
fades, the limiter, WAV, the VTT round trip and the manifest shape).

## MVP film bookends and final assembly

A cinematic open and close around the MVP showcase film (the core film, about 68 s with AI narration),
and the script that joins the three with a music bed. Compositions **OpenAR / OpenEN** and
**CloseAR / CloseEN** (`src/bookends/`): 1920 × 1080, 30 fps, 225 frames (7.5 s) each, silent.

**Footage.** Four AI-generated b-roll clips (Higgsfield, Veo 3.1 Fast; 1920 × 1080, 24 fps, 4.0 s, silent)
in `public/broll/` (about 25 MB, **not in git**; `public/broll/` is ignored): `aerial.mp4` (golden-hour aerial
of a site with tower cranes and a skyline), `engineer.mp4` (safety engineer in a white hard hat and orange
vest reviewing a tablet), `ops-room.mp4` (bright safety operations room, curved display wall), `hardhat.mp4`
(white hard hat on a steel beam, skyline bokeh). They are illustrations, not footage of a BILTIX site, and
every frame they are on carries the tag **«لقطات توضيحية مولّدة بالذكاء الاصطناعي» / "AI-generated
illustrative footage"** (lower letterbox bar, inline-end corner). The footage is never mirrored for Arabic.
Clips play through `<OffthreadVideo muted>`; a clip that must stay on screen longer than 4.0 s is slowed to
0.94× (never frozen). At 30 fps every fifth output frame repeats a 24 fps source frame (the usual
24 → 30 cadence); the slow push and drift drawn on top stay smooth.

| | Open (7.5 s) | Close (7.5 s) |
|---|---|---|
| 0–0.8 s | aerial site, letterbox opening from a slit to 2.39:1, first frames up from a dim exposure | from `#F4F7FB` dissolving into the operations room |
| 0.5–2.3 s | the laser comet draws the nickel-orange frame (fast first lap, then the app's cruise speed; clockwise in English, counter-clockwise in Arabic), emblem builds, name lines rise | — |
| 3.3–4.0 s | cross-dissolve aerial → engineer (centre 3.65 s) | cross-dissolve operations room → hard hat; end card starts: frame drawn by the comet, emblem, wordmark |
| title / card | AR: «بلتكس للمخاطر بالذكاء الاصطناعي» (lead) + BILTIX Risk AI + «من الموقع… إلى القرار، بالدليل»; EN: BILTIX Risk AI (lead) + Arabic name + "From the site to the decision — with evidence" | wordmark + Arabic name, AR «قرارات مدعومة بالدليل، / بإشراف بشري» / EN "Evidence-backed decisions, / with humans in control", link pill `biltix-risk-ai.vercel.app` |
| 6.7–7.5 s | dissolve to `#F4F7FB` (the app plane and the core film's first frame); the last frame is flat `#F4F7FB` | fade back to `#F4F7FB` |

Look: a soft grade (multiply cream on the highlights, soft-light warmth from the sun side, slightly cooler
deeper shadows, a warm lens vignette), a local warm-black shade behind the text, and the text on a
smoked-glass plate inside the metal frame (white text: names 56–84 px, tagline and closing line 36–46 px,
secondary lines 32–42 px, the tag 21 px; IBM Plex Sans / IBM Plex Sans Arabic, no letter-spacing on Arabic). The open's title sits left of centre, clear of the engineer; the close's card
right of centre, clear of the hard hat. 2D transforms only (no `perspective`, `preserve-3d` or
`translateZ`), all motion eased with `EASE` from `theme.ts`.

```bash
# render (JPEG frames, CRF 18; each took 8–12 min on the shared 4-core sandbox, concurrency 2)
for id in OpenAR OpenEN CloseAR CloseEN; do
  npx remotion render src/index.ts $id out/bookends/remotion/$id.mp4 --concurrency=2 --image-format=jpeg \
    --jpeg-quality=95 --crf=18 --pixel-format=yuv420p --codec=h264 --muted
done
# Remotion's JPEG path writes full-range BT.601 YUV (ffprobe: yuvj420p, bt470bg); deliver standard
# yuv420p, BT.709, limited range (0.9 grey levels from the render on average):
for id in OpenAR OpenEN CloseAR CloseEN; do
  ffmpeg -i out/bookends/remotion/$id.mp4 -an -c:v libx264 -profile:v high -preset slow -crf 18 -pix_fmt yuv420p \
    -vf colorspace=ispace=bt470bg:iprimaries=bt709:itrc=bt709:irange=pc:space=bt709:primaries=bt709:trc=bt709:range=tv:format=yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart out/bookends/$id.mp4
done
node scripts/bookend-stills.mjs --ids OpenAR,CloseEN --frames 20,90,160   # review stills from the compositions
```

### Final assembly: `scripts/showcase-final.mjs`

```bash
node scripts/showcase-final.mjs --lang ar \
  --core BILTIX-MVP-Arabic.mp4 --open open-ar.mp4 --close close-ar.mp4 \
  --music score.mp3 --out BILTIX-MVP-Cinematic-Arabic.mp4 [--xfade 0.5] [--hold 1.0] [--music-start 0] \
  [--stems dir] [--report plan.json] [--dry-run]
```

- **Picture**: open + core + close joined with two 0.5 s `xfade` dissolves (smoothstep-eased custom
  transition). The core starts at open − 0.5 s, the close at open + core − 1.0 s; total = open + core +
  close − 1.0 s. Inputs are normalised to 1920 × 1080, 30 fps, yuv420p, SAR 1 and cut to their exact frame
  counts.
- **Narration**: the core film's own audio track, cut to the core's picture length and delayed by
  open − crossfade (`adelay` in samples), so each line stays on the frame it was rendered with. Use the
  narration-only core (the Remotion master): the script warns when the core audio has no silences
  (music already mixed in).
- **Music**: trimmed to the film (looped only if shorter), 1.5 s fade-in and 3 s fade-out (quarter-sine),
  set to −16 LUFS ("full level", measured with `ebur128`), then gain-automated from the narration: speech
  spans from `silencedetect` (−45 dB, 0.3 s) on the core audio; full level in the open and the close,
  −7 dB between lines, −15 dB under a line (0.3 s attack, 0.5 s release), smoothstep ramps, gain updated
  every 10 ms (`asetnsamples` 480 + `volume` `eval=frame`). A gap shorter than `--hold` (default 1.0 s)
  keeps the duck: the showcase's lines are about 0.77 s apart, and letting the bed swell 7 dB and drop
  back inside each breath is audible pumping, so the bed sits at −15 dB through the narration and comes
  up to −7 dB in real pauses (the 1.9 s lead-in and the 2.4 s tail). `--hold 0` ducks every line on its own.
- **Loudness**: the sum is measured (`ebur128`), one gain brings it to −16 LUFS integrated, and a
  look-ahead limiter at 4× sample rate (−2 dBFS) keeps the true peak under −1.5 dBTP after AAC encoding.
- **Colour**: Remotion writes full-range YUV with the BT.601 matrix (`yuvj420p`, tagged `bt470bg`). Each input
  goes through the `colorspace` filter to the BT.709 matrix, limited range (primaries and transfer untouched):
  a frame decoded from the final file differs from the same frame decoded from the render by 0.5 grey levels
  on average (a plain `format=yuv420p` would keep the BT.601 matrix under BT.709 tags: up to 14 levels off).
- **Encode**: H.264 High, CRF 21, preset slow, yuv420p, BT.709 tags, 30 fps, keyframe every 4 s,
  `+faststart`; AAC-LC 192 kb/s, 48 kHz stereo. Exact frame count (`-frames:v`).
- **Check** (printed, and exit 1 on failure): durations and offsets, frame count, `ebur128` integrated
  loudness / LRA / true peak of the written file, and `blackdetect` (≥ 0.04 s, 98 % of pixels below 10 %).
  Needs a full ffmpeg (`/usr/bin/ffmpeg` 6.1 or `$FFMPEG`): Remotion's bundled ffmpeg lacks these filters.
- **Music**: `score.mp3`, an 85.5 s cinematic instrumental generated with Lyria 3 Pro through
  Higgsfield / Artlist (not in git; check the generator's licence terms before publishing).

### Bookend build and assembly tests (2026-11-11)

| File | Frames | Size | Notes |
|---|---|---|---|
| `open-ar.mp4` / `open-en.mp4` | 225 (7.5 s) | 7,357,377 / 7,229,689 B | rendered 9.7 / 7.7 min, then converted to yuv420p BT.709 |
| `close-ar.mp4` / `close-en.mp4` | 225 (7.5 s) | 6,908,231 / 6,908,993 B | rendered 8.0 / 11.5 min |

- Stills every 0.75 s of all four renders reviewed: Arabic joined and ordered correctly in the title, the
  tagline (ellipsis and Arabic comma at the right ends), the closing lines and the tag (with its shadda);
  no text clipped; the plates keep white text readable over the sky. Frame-to-frame change: no one-frame
  pop in any bookend (largest changes are the eased dissolves, ≤ 21 grey levels per frame at 480 × 270).
- Stand-in assembly (both languages): stand-in core = `explainer-<lang>-720p.mp4` upscaled to 1080p
  (41.5 s) with a synthetic narration of nine tone "lines" at −16 LUFS, at frame-aligned times, and a
  magenta box drawn exactly while each line sounds; music = `score.mp3`. Result 55.5 s, 1,665 frames
  (7.5 + 41.5 + 7.5 − 2 × 0.5) as computed; −16.1 LUFS integrated, LRA 5.6 LU, true peak −2.0 dBFS;
  `blackdetect`: none; mean luma never dips at either joint (it rises from the footage to the light plane).
- Sync: the same assembly with silent music; box onsets (`signalstats`) and line onsets (`silencedetect`
  on the final audio) coincide on all nine lines in both languages (offset 0.0 ms).
- Ducking, measured from the `--stems` music stem against the same music with only the static gains:
  open 0.0 dB, core lead-in −7.0 dB, under the lines −15.0 dB, core tail −7.0 dB, close 0.0 dB.
- Colour: frames of the final file differ from the same frames of the bookend and core files by about
  1 grey level on average, with no channel bias.

## Last build

2026-11-11, data extracted from this tree's `biltix-hse` (anchor day 2026-11-09; `src/data.json`
and both VTT files are byte-identical to the v3.1 build). 4-core build sandbox shared with other
jobs (load average 3 to 9 during the renders), `--concurrency=3`, PNG frames, CRF 20, x264
`slow`, one language after the other:

| Step | Time | Output |
|---|---|---|
| `render:ar` | 1,612 s | `out/biltix-explainer-ar-1080p.mp4` 11,162,092 B (1920×1080, 1,245 frames, 41.5 s, H.264 High, no audio) |
| `render:en` | 2,220 s | `out/biltix-explainer-en-1080p.mp4` 11,808,210 B |
| `export:web` (both) | 111 s | `explainer-ar-720p.mp4` 3,422,152 B (CRF 25) · `explainer-en-720p.mp4` 3,238,518 B (CRF 26) · posters 46,644 B / 49,656 B |
| `captions` | < 1 s | `explainer-ar.vtt` 1,317 B · `explainer-en.vtt` 1,026 B (10 cues each, shortest 1.9 s; unchanged) |
| `check:framing` | < 1 s | 5,744 box-frames, both languages: all key text inside the safe area |
| `check:frames` | 39 s | all four files: 0 single-frame drop-outs, Demo-data chip on 1,245 / 1,245 frames |

The v3.1 files were 11,579,131 / 12,182,626 B (masters) and 3,196,167 / 3,428,511 B (web, both
CRF 25). The English web file now needs CRF 26 to stay within the 3.3 MiB budget; the Arabic one
is 7.1 % larger than before, the English one 5.5 % smaller. No browser crash or retried frame in
either render.

Frame check details. `check:frames` dismissed (and listed) these flags: the rolling record counter
(Arabic frame 143, one tile, in the master and the web file) and the lowest frame of the
"dip through the canvas" entrances (frames 206, 742, 744, 881 and 1012, depending on the file:
the frame sits between its two neighbours, the bottom of a fade-out followed by a fade-in). Run against the v3.1
files, the same script reports every known drop-out and nothing else: English 233, 765, 811, 812,
813, 902 and Arabic 44, 112, 345, in the masters and in the web files, plus the 102 frames without
the chip (intro 0–65 and the full-frame camera feed 645–680).

## In the app

The cockpit's "How the platform works" dialog (`biltix-hse/js/views/cockpit.js`,
`openExplainer`) embeds these files: poster, `preload="none"`, playback only on the viewer's
click, the version in the page language with a switch to the other one, no audio track (until a
narration is muxed, see "7. AI narration"; the manifest says which language has a voice), and
focus back on the "How the platform works" button when the dialog closes. The captions are burned
into the picture, so the WebVTT file is attached as a `captions` track in the page language that
is **off by default** (no `default` attribute): a native cue drawn on top would only cover the
burned-in caption, or on a small player the scene's own text (the intro tagline). Viewers who
prefer the player's own caption rendering (their caption size, colour and background settings)
turn it on from the player's captions menu; the cues then follow the burned-in ones exactly. A
browser set to always show captions (for example Safari with the system caption preference) may
turn the track on by itself; that is the viewer's own setting and is left alone. The file names
are unchanged and the duration is read from the video's metadata.

Testing the embed locally: `python3 -m http.server` does not answer HTTP `Range` requests, so a
browser cannot seek an MP4 it serves (every seek lands on 0:00). Use a server with range support
(any CDN, Vercel, `npx serve`, …) when checking seeking or caption timing.

## MVP showcase video

A second, longer film about the whole project: **ShowcaseAR** and **ShowcaseEN** (1920 × 1080, 30 fps,
about 68 s each), one scene per narration line, built from real captures of the app (`../biltix-hse`).
It lives next to the explainer and shares its theme, fonts, emblem, metal edge, laser comet and 2D camera
(`src/lib/camera.ts`, no CSS 3D context), and adds `src/showcase/`.

| # | Line (EN) | What is on screen |
|---|---|---|
| 1 | BILTIX Risk AI. Safety risk, seen clearly. | emblem builds, wordmark + Arabic name in a metal frame drawn by the laser; the cockpit capture rises behind in true perspective (canvas, one 2 px row at a time) |
| 2 | One platform … in Arabic and English. | the English and Arabic cockpits slide in, mirrored, with language chips |
| 3 | The cockpit brings every risk onto one screen. | cockpit in a browser frame, slow dolly down the full-page capture |
| 4 | Ring gauges and radar trends … | macro push-in on the domain ring gauges, then the 12-week radar trend, with callouts |
| 5 | Every AI score is explained … | risk drawer (AIR-1014): severity, model confidence, data quality → "Why this risk was raised" → the source evidence |
| 6 | A human reviewer approves … | pointer on "Accept recommendation" → "Accept and create task" → the task board; the new card glides into "New" |
| 7 | The site map ties risks, zones and simulated cameras to place. | spatial view, zone Z2 and its links → the camera viewer with its Simulated / not connected labels |
| 8 | Thirteen demo data sources … | counter and the 13 sources (from the data-quality page) ticked; integrations page beside it |
| 9 | Twenty-three screens … | mosaic of all 23 routes (real thumbnails, nav titles in the video's language) |
| 10 | A light, precise design … | a real metric tile under the metal edge and laser, construction guides, colour tokens, type |
| 11 | Built for accessibility and speed … | phone captures (390 × 844 @3x) and measured checks: tests passing, six widths without sideways scroll |
| 12 | Demo data today … | macro crops of the app's own Demo data / Illustrative value / Simulated labels |
| 13 | Evidence-backed decisions, with humans in control. | closing lockup and the link biltix-risk-ai.vercel.app |

Captions (lower third, start-aligned, ≥ 40 px on a plate) are the narration lines; the Arabic ones drop the
tashkeel and use the app's spelling «بلتكس». A Demo-data chip is on screen on every frame.

### Build

```bash
# 1. captures (Playwright + Chromium; serves ../biltix-hse on 127.0.0.1:9701 if nothing listens there)
NODE_PATH=/opt/node-tools/node_modules node scripts/showcase-capture.mjs --check-widths
# 2. narration: lines, loudness, timeline → public/voice/showcase-<lang>.norm.wav, src/showcase/voice-timing.json
node scripts/showcase-voice.mjs
# 3. review stills (optional) → out/showcase-stills/
node scripts/showcase-stills.mjs --at 0.3,0.8
# 4. render (JPEG frames are fine here: no hairline grid under motion) and check every frame
npm run showcase:render:ar && npm run showcase:render:en
python3 scripts/check-frames.py out/biltix-mvp-ar-1080p.mp4 ar
python3 scripts/check-frames.py out/biltix-mvp-en-1080p.mp4 en
# 5. optional music bed, ducked under the voice
node scripts/showcase-mix.mjs --video out/biltix-mvp-en-1080p.mp4 --music bed.wav
```

- **Captures** (`public/showcase/`, about 80 MB, not in git; only `manifest.json` is): fixed clock
  2026-11-10T09:00:00+03:00 as in `tools/qa.mjs`, English through `?lang=en` + `i18n.setLang`, light theme,
  1600 × 900 at DPR 2 for all 23 routes in both languages, full-page JPEG q92 for cockpit, overview, airisks,
  spatial and integrations, the drawer flow on AIR-1014, the spatial zone and camera viewer, and phones at
  390 × 844 DPR 3. Each shot waits for the ready flag, fonts, non-blank canvases, the edge overlay and the end
  of every finite animation; the infinite edge comets are paused at one time (and hidden in full-page shots,
  where their layers once composited as a solid block). `manifest.json` records sizes and the rectangles the
  camera aims at, so every push-in follows the real layout in each language.
- **Narration** (`public/voice/showcase-<lang>.mp3`, ElevenLabs eleven_multilingual_v2; Arabic narrator
  Saadoun, English narrator Ryan): the 12 longest silences split the 13 lines; gain to about −16 LUFS, a
  4×-rate look-ahead limiter, then loudnorm two-pass in linear mode → −16 LUFS / ≤ −1.5 dBTP; the gaps between
  lines are gated to true zero with 20 ms ramps. Scene i = line + 0.9 s with the line 0.35 s in; scene 1 adds
  a 1.6 s lead-in, scene 13 holds 2.5 s. Each line is one `<Html5Audio trimBefore>` clip whose ends fall in
  the gated silence, so cuts never click.
- **Mix** (`scripts/showcase-mix.mjs`): music normalised to −16 LUFS, −14 dB under each line (0.25 s attack,
  0.4 s release), −6 dB between lines, 1.5 s fade-in, 3 s fade-out; the sum to −16 LUFS / −1.5 dBTP; video
  stream copied → `<name>-music.mp4`. `--stem` writes the processed music alone to check the ducking.

## Project layout

```
remotion.config.ts        CLI config (browser, codec, CRF, pixel format)
scripts/extract-data.mjs  dataset → src/data.json
scripts/write-captions.mjs  storyboard → WebVTT
scripts/export-web.mjs    720p web encodes + WebP posters + faststart remux + media manifest (re-applies a recorded narration)
scripts/voice-mux.mjs     AI narration → split, placed per scene window, loudness-normalised, muxed (npm run voice)
scripts/lib/narration.mjs pure helpers: silences → lines, letter-share check, placement, fades, true-peak limiter, WAV
scripts/lib/story.mjs     storyboard → cue list, narration script, VTT text, manifest text
scripts/lib/media.mjs     ffmpeg side: layout, silent original, web encode, narration mux, manifest writer
tests/narration.test.mjs  unit tests (npm test)
tests/synth-narration.mjs synthetic narration test signal for end-to-end runs
scripts/contact-sheet.mjs review stills (scripts/sheet.py tiles them)
scripts/env.mjs           browser + bundled ffmpeg discovery for the Node scripts
scripts/check-framing.mjs every card's key text through every frame of the camera paths (npm run check:framing)
scripts/check-frames.py   drop-outs and the Demo-data chip on every frame of the rendered files (npm run check:frames)
src/storyboard.ts         timing, transitions, step labels, captions (single source of truth)
src/shots.ts              the camera's shot list per scene (aim / aimY framing helpers)
src/Explainer.tsx         composition (RTL/LTR), far background plate, scenes, HUD
src/lib/camera.ts         virtual camera: shot interpolation, mirroring, projection of each depth plane to a 2D matrix
src/components/Stage.tsx  stage (clips the frame), depth planes with 2D matrices (rack focus), scene dissolves
src/components/Metal.tsx  metal-edge cards, laser comet, metal rings
src/components/Ring.tsx   ring gauge with radial weekly bars, exact donut
src/components/Chrome.tsx background plate, HUD (top bar, step dial, caption band), chips
src/scenes/*.tsx          the ten beats (SiteCam.tsx = the simulated camera)
src/showcase/             MVP showcase: Showcase.tsx (composition, HUD, lower third, audio), scenes-a/b.tsx,
                          ui.tsx (capture cards, browser and phone frames, callouts, perspective plane),
                          timeline.ts + voice-timing.json, copy.ts, captures.ts (manifest access)
scripts/showcase-*.mjs    captures, narration prep, review stills, music mix
```
