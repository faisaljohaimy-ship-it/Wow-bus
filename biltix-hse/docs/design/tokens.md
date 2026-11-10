# BILTIX Risk AI — design tokens (v3 "Precision")

Source of truth: `css/tokens.css` (values), `css/base.css` (background layers, shell geometry).
Contract: `docs/specs/v3-precision/CONTRACT.md` §2, §3, §3.1. Component usage: `docs/design/components.md`.

**Principles.** One hierarchy on every screen (page → section → card → body → label → helper).
Data always sits on opaque surfaces. Red / amber / green mean risk state only and always ship
with an icon and a label. Gold is ornament only (logo, hairlines, the rail-group diamond), never
status. Dark and light are tuned separately — a light value is never "the dark value inverted".
Every pre-v3 variable name still works (aliases listed at the end).

---

## 1. Colour

### Surfaces, lines, ink

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg-0` | `#080F1B` | `#F4F7FB` | App plane (page background). |
| `--bg-1` | `#111D2E` | `#FFFFFF` | Cards, charts, tables, drawers, popovers (the validator surface). |
| `--bg-2` | `#17263B` | `#F3F6FA` | Raised / nested: dark inputs, hover wells, table header (light), nested panels. |
| `--bg-3` | `#1D2F48` | `#E8EEF6` | Pressed, selected tracks, progress tracks, skeletons. |
| `--line` | `#26384F` | `#DCE5EF` | Hairline borders and gridlines. Decorative only. |
| `--line-2` | `#33496A` | `#C5D2E1` | Stronger dividers, axis baselines, button outlines. |
| `--line-strong` | `#62789A` | `#7888A0` | **Control boundaries** (inputs, selects, textarea, switch): ≥ 3:1 on every surface. |
| `--ink-1` | `#F4F7FB` | `#132238` | Primary text, values. |
| `--ink-2` | `#B8C6D8` | `#3D4F69` | Secondary text, labels, table headers. |
| `--ink-3` | `#93A3BA` | `#55647C` | Helper text, meta, placeholders (still ≥ 4.5:1). |
| `--input-bg` | `= --bg-2` | `= --bg-1` | Field fill (light inputs are white on white cards). |

### Brand, accent, focus, ornament

| Token | Dark | Light | Use |
|---|---|---|---|
| `--brand` | `#2F6FED` | `#2F6FED` | Fills only: primary button, selected indicator, progress. White on it = 4.55:1. |
| `--brand-ink` | `#FFFFFF` | `#FFFFFF` | Text on `--brand`. |
| `--brand-text` | `#7FA6FF` | `#1F5AD6` | Brand as text: links (`--link`), active icons, selected labels. |
| `--brand-soft` / `--brand-line` | 16 % / 50 % mix | 10 % / 45 % mix | Selected / pressed backgrounds and their borders. |
| `--accent` | `#19C6E6` | `#0E93AC` | Live indicators, done marks in pipelines, kanban drop target. |
| `--accent-text` | `#19C6E6` | `#0A7489` | Accent as text: module codes (`.code-tag`), datum captions. |
| `--accent-text-strong` | `#19C6E6` | `#086A7D` | Accent text on accent tints (`.tone-accent` badges, `live` status): 5.09:1 on the light tint over bg-2 (plain `--accent-text` is 4.42 there). |
| `--focus` | `#19C6E6` | `#0A7489` | Focus ring (2 px + 2 px offset), ≥ 4.6:1 on every surface. |
| `--gold` | `#D4A017` | `#B8860B` | **Ornament only**: logo, app-bar hairline, hero edge, rail-group diamond. Never status. |
| `--hover` / `--selected` | ink 5 % / brand 14 % | ink 4 % / brand 8 % | Row / item hover and selection washes. |
| `--scrim` | `rgba(3,7,14,.62)` | `rgba(19,34,56,.34)` | Behind dialogs, drawers, command palette (solid, no blur). |

### Status (risk state)

Marks (dots, bars, heatmap cells, stripes) use the raw tone; **text uses the `-text` variant**.

| State | Mark (both themes) | Text dark | Text light | Icon (always) |
|---|---|---|---|---|
| good / green | `--good #0CA30C` | `--good-text #45D145` | `#087208` | check |
| warning / amber | `--warning #FAB219` | `--warning-text #FBBD3C` | `#8A5A00` | triangle |
| serious | `--serious #EC835A` | `--serious-text #F29C78` | `#A4471F` | triangle / arrow |
| critical / red | `--critical #D03B3B` | `--critical-text #F2837B` | `#B42318` | x-circle |

Components read a tone through four local variables set by `.tone-*` classes (or
`.is-red|is-yellow|is-green` / `[data-rating]`): `--tone` (mark), `--tone-ink` (text),
`--tone-soft` (tint fill: 14 % dark, 11 % light), `--tone-line` (border).

**Do** pair every status colour with an icon and a word. **Don't** colour body text, numbers in
tables or headings with a raw mark colour (`--warning` on white is 1.8:1); use `--*-text`.

### System status (CONTRACT §5)

Data/connection states are not risk states, so they use the brand / accent / neutral family; only
`stale` and `error` borrow warning / critical because they need action. Dashed borders mean
"simulated / not real".

| Status | Tone | Border |
|---|---|---|
| `demo` | brand (`--brand-text`) | dashed |
| `live` | accent (`--accent-text`) | solid |
| `offline` | neutral (`--ink-2`) | solid |
| `stale` | warning (`--warning-text`) | solid |
| `error` | critical (`--critical-text`) | solid |
| `not_connected` | neutral, hollow dot | dashed |

The badge tint (`--tone-soft`, 12 %) is translucent. Light `demo` uses ink `#174AB5`. On the page plane
(`.view-head`, over the ambient background) components.css lays the tint over an opaque `--bg-1`, so
the label's contrast does not depend on the art behind it. Measured from rendered pixels behind the
glyphs, light theme, 1440 / 390, AR + EN: page-plane badges 6.67:1; every status badge on cockpit,
airisks, settings, contracts, dataquality, integrations, engine ≥ 5.42:1.

**Inside chart labels** (segmented bar values, heatmap cells) use whichever of `--ink-on-light` /
`--ink-on-dark` contrasts more with the fill, or an opaque `.cell-plate` (`--bg-1` + `--ink-1`) when
neither reaches 4.5:1. Hover, focus and active states ring the mark and never brighten or dim a fill,
so the ratio holds in every state (measured ≥ 4.51:1 at rest, hovered and with a sibling active).

### Series

`--s1 … --s8` (categorical, fixed order) and `--seq-*`, `--div-*` are unchanged from v2.
Validated with the dataviz validator on the new surfaces: dark on `#111D2E` — all checks pass;
light on `#FFFFFF` — pass with the documented relief (s3/s4/s5 under 3:1 need visible labels or the
table view, which every chart ships).

### Measured contrast

WCAG 2.x ratios computed with `contrast()` from the dataviz palette validator, with the values
parsed from `css/tokens.css` (QA script kept outside the repo, see §8). axe-core `color-contrast`
reported 0 violations on cockpit, settings, airisks, risks and reports in both themes.

#### Dark theme

| token | value | bg-0 #080F1B | bg-1 #111D2E | bg-2 #17263B | bg-3 #1D2F48 | min | target |
|---|---|---:|---:|---:|---:|---:|---|
| --ink-1 | #F4F7FB | 17.86 | 15.77 | 14.19 | 12.59 | 12.59 | 4.5 PASS |
| --ink-2 | #B8C6D8 | 11.06 | 9.77 | 8.79 | 7.80 | 7.80 | 4.5 PASS |
| --ink-3 | #93A3BA | 7.48 | 6.61 | 5.95 | 5.27 | 5.27 | 4.5 PASS |
| --brand-text | #7FA6FF | 8.04 | 7.10 | 6.39 | 5.67 | 5.67 | 4.5 PASS |
| --accent-text | #19C6E6 | 9.38 | 8.28 | 7.45 | 6.61 | 6.61 | 4.5 PASS |
| --good-text | #45D145 | 9.56 | 8.44 | 7.60 | 6.74 | 6.74 | 4.5 PASS |
| --warning-text | #FBBD3C | 11.37 | 10.05 | 9.04 | 8.02 | 8.02 | 4.5 PASS |
| --serious-text | #F29C78 | 8.96 | 7.91 | 7.12 | 6.31 | 6.31 | 4.5 PASS |
| --critical-text | #F2837B | 7.59 | 6.71 | 6.03 | 5.35 | 5.35 | 4.5 PASS |
| --line-strong (non-text) | #62789A | 4.27 | 3.77 | 3.39 | 3.01 | 3.01 | 3.0 PASS |
| --focus (non-text) | #19C6E6 | 9.38 | 8.28 | 7.45 | 6.61 | 6.61 | 3.0 PASS |
| --good (mark) | #0CA30C | 5.72 | 5.05 | 4.55 | 4.03 | 4.03 | icon + label |
| --warning (mark) | #FAB219 | 10.46 | 9.24 | 8.31 | 7.37 | 7.37 | icon + label |
| --serious (mark) | #EC835A | 7.27 | 6.42 | 5.78 | 5.13 | 5.13 | icon + label |
| --critical (mark) | #D03B3B | 3.99 | 3.53 | 3.17 | 2.82 | 2.82 | icon + label |

Status text on its own 14 % tint (badges): good 7.08 · warning 7.65 · serious 6.45 · critical 6.08
(on bg-1); 6.35 · 6.84 · 5.78 · 5.50 (on bg-2). Text on fills: white on `--brand` 4.55 ·
`--ink-on-dark` on `--critical` 4.51 · `--ink-on-light` on `--warning` 8.71 / `--good` 4.77 /
`--serious` 6.06 / `--accent` 7.81 · `--brand-text` on brand-soft 5.98.

#### Light theme

| token | value | bg-0 #F4F7FB | bg-1 #FFFFFF | bg-2 #F3F6FA | bg-3 #E8EEF6 | min | target |
|---|---|---:|---:|---:|---:|---:|---|
| --ink-1 | #132238 | 14.88 | 15.99 | 14.75 | 13.70 | 13.70 | 4.5 PASS |
| --ink-2 | #3D4F69 | 7.75 | 8.33 | 7.69 | 7.14 | 7.14 | 4.5 PASS |
| --ink-3 | #55647C | 5.58 | 6.00 | 5.54 | 5.14 | 5.14 | 4.5 PASS |
| --brand-text | #1F5AD6 | 5.60 | 6.01 | 5.55 | 5.15 | 5.15 | 4.5 PASS |
| --accent-text | #0A7489 | 5.05 | 5.42 | 5.00 | 4.65 | 4.65 | 4.5 PASS |
| --good-text | #087208 | 5.71 | 6.14 | 5.66 | 5.26 | 5.26 | 4.5 PASS |
| --warning-text | #8A5A00 | 5.52 | 5.93 | 5.47 | 5.08 | 5.08 | 4.5 PASS |
| --serious-text | #A4471F | 5.58 | 6.00 | 5.54 | 5.14 | 5.14 | 4.5 PASS |
| --critical-text | #B42318 | 6.12 | 6.57 | 6.07 | 5.63 | 5.63 | 4.5 PASS |
| --line-strong (non-text) | #7888A0 | 3.35 | 3.60 | 3.32 | 3.09 | 3.09 | 3.0 PASS |
| --focus (non-text) | #0A7489 | 5.05 | 5.42 | 5.00 | 4.65 | 4.65 | 3.0 PASS |
| --good (mark) | #0CA30C | 3.12 | 3.35 | 3.09 | 2.87 | 2.87 | icon + label |
| --warning (mark) | #FAB219 | 1.71 | 1.83 | 1.69 | 1.57 | 1.57 | icon + label |
| --serious (mark) | #EC835A | 2.46 | 2.64 | 2.43 | 2.26 | 2.26 | icon + label |
| --critical (mark) | #D03B3B | 4.47 | 4.80 | 4.43 | 4.12 | 4.12 | icon + label |

Status text on its own 11 % tint: good 5.40 · warning 5.55 · serious 5.42 · critical 5.60 (on bg-1);
5.02 · 5.16 · 5.03 · 5.19 (on bg-2); `--accent-text-strong` on the accent tint 5.48 / 5.09. Text on fills: white on `--brand` 4.55 · white on
`--accent-text` 5.42 (light accent button and solid accent badge) · `--brand-text` on brand-soft 5.07.

---

## 2. Typography

**Fonts** — self-hosted in `assets/fonts/` (SIL OFL, `assets/fonts/OFL.txt`), no Google Fonts:

| File | Family | Weights | Subset |
|---|---|---|---|
| `plex-arabic-arabic-{400,500,600,700}.woff2` | IBM Plex Sans Arabic | 400–700 | Arabic |
| `plex-arabic-latin-{400,500,600,700}.woff2` | IBM Plex Sans Arabic | 400–700 | Latin (same glyphs as Plex Sans) |
| `plex-sans-latin-{400,500,600}.woff2` | IBM Plex Sans | 400, 500, 600 (answers 700) | Latin |
| `plex-mono-latin-{400,500}.woff2` | IBM Plex Mono | 400, 500 (answers 600/700) | Latin |

`font-display: swap`; each face carries its subset's `unicode-range`, so the browser only fetches
what a page uses (Arabic UI never downloads Plex Sans). The shell preloads the active language's
400 weight. Metric-compatible `local()` fallbacks keep the swap reflow-free:

| Fallback family | Local faces | size-adjust | ascent / descent |
|---|---|---|---|
| Plex Arabic Fallback | Arial, Liberation Sans, Helvetica | 100.87 % | 107.56 % / 41.14 % |
| Plex Arabic Fallback Naskh (Arabic range) | DejaVu Sans, Noto Sans Arabic | 87.74 % | 123.66 % / 47.30 % |
| Plex Sans Fallback (Latin range) | Arial, Liberation Sans, Helvetica | 100.87 % | 101.62 % / 27.26 % |
| Plex Mono Fallback (Latin range) | Courier New, Liberation Mono, Menlo | 100 % | 102.50 % / 27.50 % |

(Computed with fontkit from the woff2 files against the local faces; see the comment in `tokens.css`.)
The Plex Sans and Plex Mono fallbacks leave U+2010–2011 (hyphen, non-breaking hyphen) out of their
`unicode-range`: neither Latin subset has them, so they fall through to the Plex Sans Arabic hyphen
instead of a local Arial / Liberation glyph.

**Glyph coverage** — beyond Latin-1 the Latin subsets hold only – — ‘ ’ ‚ “ ” „ • … ‹ › ⁄ € ™ ↑ ↓ − ∕
(Plex Sans and Plex Mono also ′ ″). No bundled file has → ← ↔ ≥ ≤ ≈ ₂ σ Δ ✓ ✕, so copy must not use
them: they would render and print in a system font (checked against the cmap of the woff2 files; see the
comment in `tokens.css`).

**Stacks** — `--font-ar`, `--font-en`, `--font-mono`, and `--font-sans`, which resolves per
`html[lang]`: Arabic first in `ar`, Latin first in `en` (Arabic data in English mode still renders in
Plex Sans Arabic). `--font-mono` = Plex Mono, Plex Mono Fallback, then IBM Plex Sans Arabic (and the
Naskh fallback) before the system monospace: Plex Mono has no Arabic script, so Arabic-Indic digits
(numerals = arab), ٪ ٫ ٬, the U+061C mark Intl puts in Arabic-Indic numbers and stray Arabic letters
render in Plex Sans Arabic rather than a system monospace (before: DejaVu Sans Mono on screen and in
PDFs). `--font-mono-mixed` = Plex Mono for Latin/digits, then the language's sans face
for Arabic letters inside codes such as "5س 12د".

**Scale** — `--fs-xs 12` · `--fs-sm 13` · `--fs-ui 14` (controls, table cells, nav) · `--fs-md 15`
(body) · `--fs-lg 17` · `--fs-xl 20` · `--fs-2xl 24` · `--fs-3xl 30` · `--fs-hero 44` (px).
Line height: body `--lh-body` 1.65 (ar) / 1.55 (en); headings `--lh-heading` 1.3; tight 1.2.
Arabic is never letter-spaced; English headings tighten (`--tracking-heading -.01em`) and small
labels open slightly (`--tracking-caps .02em`).

**Text roles** (use these instead of ad-hoc sizes):

| Class | Size / weight | Use |
|---|---|---|
| `.t-page` | 30 / 600 (24 below 768 px) | The page title (one per view, the `h1`). |
| `.t-section` | 20 / 600 | Section headings inside a page (B: domains, C: analysis …). |
| `.t-card` | 17 / 600 | Card and drawer-section titles. |
| `.t-body` | 15 / 400, body line height | Paragraphs, explanations. `.t-lead` = secondary-ink intro paragraph. |
| `.t-label` | 13 / 500, ink-2 | Field labels, metric labels, column labels. |
| `.t-helper` | 13 / 400, ink-3 | Hints, "updated 3 min ago", comparison periods. |
| `.t-metric` | 30 / 600, tabular lining figures | Executive numbers. `.is-hero` 44, `.is-sm` 24. |

Codes (AIR-1042, CT-2026-014): `.code` / `.mono` (+ `.nowrap`, `dir="ltr"`). Tables and axes use
tabular figures.

---

## 3. Space, shape, elevation

- **Spacing** `--space-1 … --space-8` = 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 px. Page gutter
  `--gutter` 24 (16 on phones), section gap `--gap` 20, card padding `--card-pad` 20.
- **Radii** `--radius-sm 6` (chips inside controls, small icons) · `--radius-md 10` (controls,
  inner panels, table wrap) · `--radius-lg 14` (cards, dialogs) · `--radius-xl 20` (bottom sheet) ·
  `--radius-pill`.
- **Elevation** `--elev-1` cards (soft, short) · `--elev-2` popovers, menus, toasts · `--elev-3`
  dialogs, drawers, the open activity panel. Don't stack shadows on nested cards (`.card.is-plain`).

## 4. Motion

`--dur-micro 160ms` (hover, press, colour fades) · `--dur-main 260ms` (panels, dialogs, drawers,
toasts) · `--dur-slow 420ms` · `--stagger 32ms` · `--ease-out cubic-bezier(.16,1,.3,1)` ·
`--ease-in-out cubic-bezier(.65,0,.35,1)`. Movement uses transform/opacity only. The only infinite
loops are the live dot and the cinematic background; loading spinners exist only while busy.
`prefers-reduced-motion` and `html[data-motion="reduce"]` collapse every animation (tokens.css);
`html[data-motion="full"]` opts back in. Route transitions come from `motion.page()` (JS), not CSS.

## 5. Density and layout

- `html[data-density="comfortable"]` (default): controls `--ctl-h 38` (sm 32, lg 44), table rows
  `--row-h 46`. `compact`: 34 / 28 / 40, rows 40, card padding 16, gaps 16.
- Shell: `--appbar-h 64` · `--rail-w 232` / `--rail-w-collapsed 72` · `--panel-w 360` ·
  `--content-max 1600`. Coarse pointers: every control ≥ 40 px (fields 44).
- Breakpoints: 360 · 390 · 430 · 768 · 960 (tab bar) · 1024 · 1280 (rail expanded) · 1440 · 1680
  (activity panel can pin). Components adapt by container width: `@container main` (the content
  pane), `@container card` (every `.card`), `@container drawer` (drawer body).

## 6. Background (CONTRACT §3)

`html[data-bg]`: **static** (quietest, no motion) · **subtle** (default, no motion, slightly richer
light) · **cinematic** (the two ambient lights drift on `transform`, 84 s / 112 s alternate loops;
paused under reduced motion, `data-motion="reduce"`, and `.bg-layers.is-paused` while the tab is
hidden). Layers: base `--bg-0` → `.bg-ambient` (two broad radial lights, `--amb-1` brand near the
app bar, `--amb-2` accent near the hero) → `.bg-grid` (120 px engineering grid with survey crosses,
`--grid-opacity`: hairlines ≈ 3 %, faded toward the bottom) → `.bg-mark` (emblem + mono datum
caption, inline-end bottom, hidden below 960 px). The host is fixed at z-index 0; cards are opaque,
so nothing moves over data. Glass (`backdrop-filter`) only on the app bar and rail, with solid
fallbacks for `@supports not (backdrop-filter)` and `prefers-reduced-transparency`.

## 7. Legacy aliases

`--radius-card → --radius-lg`, `--radius-ctl → --radius-md`, `--shadow-1 → --elev-1`,
`--feed-w → --panel-w`, `--ease → --ease-out`, `--dur-1 → --dur-micro`, `--dur-2 → --dur-main`,
`--link → --brand-text`, `--accent-ink → --accent-text`, `--grid-alpha`, `--glow-accent`,
`--ink-on-dark #F5F8FD`, `--ink-on-light #132238`, `--select-chevron`. New code uses the v3 names.

## 8. Verify (QA scripts live outside the repo, in the v3 scratch folder)

- `contrast-table.mjs` — parses `css/tokens.css` and recomputes the tables above; exits with the
  number of failures.
- `axe-contrast.mjs` — axe-core `color-contrast` on real routes, both themes and languages.
- `css-parse.mjs` — inserts every rule of every stylesheet into a Chromium `CSSStyleSheet`
  and reports invalid rules or dropped declarations.
- When a token changes, update the comment block at the top of `tokens.css` and §1 here.
