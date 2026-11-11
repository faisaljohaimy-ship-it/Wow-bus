# BILTIX Risk AI — component guidance (v3 "Precision")

Styles: `css/base.css` (shell), `css/components.css`, `css/charts.css`, `css/platform.css`,
`css/print.css`. Builders: `js/ui/components.js` (A-UI) and `js/app.js` (shell). Tokens:
`docs/design/tokens.md`. Every component below is styled for both themes and both directions
(logical properties only) and has a reduced-motion path.

**House rules**

- One hierarchy per screen: `.t-page` → `.t-section` → `.t-card` → `.t-body` → `.t-label` → `.t-helper`.
- Data lives on opaque cards (`--bg-1`). Decoration never sits over data.
- Red / amber / green = risk state, always with an icon **and** a word. System status
  (demo/live/…) uses `.status-badge`, never a risk colour for "connected".
- Interactive targets ≥ 40 px on coarse pointers; focus ring = 2 px `--focus`, 2 px offset.
- Motion: transform/opacity, 160 ms (micro) / 260 ms (main). No infinite animation except the live
  dot and the cinematic background.
- Shapes follow one language (below): squircle tiles, pills, capsule lights, curved corner accents.
  No sharp squares or square tabs in new components.

## Shape language (v3.5)

Defined once at the top of `css/components.css` ("Shape language"), tuned per theme with custom properties
(`--tile-*`, `--pill-hl`, `--corner-*`, `--seg-*`, `--tab-light`, `--tab-glow`). CSS only: no markup or
script changes.

| Shape | Where | Rule |
|---|---|---|
| **Squircle tile** | `.metric-icon`, `.domain-icon`, `.tile-icon`, `.int-icon`, `.evidence-icon`, `.feed-icon`, `.urgent-icon`, `.state-icon` / `.empty-icon`, `.priority-rank` | 30 % round corners; where `corner-shape` is supported a true squircle (`border-radius: 50%; corner-shape: squircle`, the same visual weight). Soft tonal gradient (`--tile-tone` at 26 → 11 % over `--bg-2` dark, 17 → 6 % over white light), a top-start sheen, an inner top highlight and a small drop tinted by the tone. The tone comes from the nearest `--tone` (tile, row, card); a component sets only its size and, when it must differ, `--tile-tone` / `--tile-ink`. Category icons (domain, integration, evidence link) are brand-tinted neutrals: their state lives in the badge beside them. |
| **Pill** | `.chip`, `.badge`, `.status-badge`, `.seg`, `.tab-count`, `.chip-count`, `.kanban-count`, `.filter-bar-count`, `.sim-tag`, `.evidence-local`, `.feed-source`, `.feed-sim`, `.controls-type`, `.site-code`, `.countdown` | Full-round ends and one height scale: counts 18 · badges 20 / 22 / 26 · chips 26 / 32 · segmented `--ctl-h`. Light theme adds a 1 px inner top highlight (`--pill-hl`). `.badge.is-square` is a soft 7 px rectangle, never a sharp box. |
| **Capsule light** | tone stripes of `.tile`, `.metric-tile`, `.domain-card`, `.int-card`, `.kanban-card`, `.kanban-col-head`, `.alert-item`, `.urgent-item`, `.toast` | A 4 px capsule set into the frame (it straddles the border) with a faint glow in its tone. Card-like hosts carry a 24 px light level with their head; list rows a light the height of the row; metric tiles and kanban column heads a tapered light along the top edge. Decoration only: the icon + word next to it carry the state. |
| **Corner accent** | `.card.is-framed` (not hero, plain or nested) | Four curved nickel-orange arcs, concentric with the card corner (1.5 px ring inset 5 px, radius = card radius − edge − 5 px), bright on the block-start / inline-start sides and deep on the others (mirrors in Arabic), faded along each edge by a mask over ~24 px. Static: painted once; only a clickable card's hover / focus raises its opacity. Cards whose body is a flush table drop the two corners the table touches. Replaces the v3.0 CAD brackets (the Edges rule keeps their transparent layers so the metal rule stays untouched). |
| **Glide** | `.seg` thumb, tab light | See "Segmented, chips, tabs". Transform + opacity only, 220–240 ms on `--ease-glide`. |

Micro-motion: icon tiles lift 1 px and grow 6 % when their own clickable host is hovered or focused;
chips lift 1 px on hover and press to 97 %; all offsets are multiplied by `--shell-fx` (0 under reduced
motion) and transitions are 160 ms. Nothing moves at rest: no shape adds an idle animation, so the
Static background, reduced motion and print need no extra switch.
Forced colours: tiles become Canvas squircles with a CanvasText border, the selected segment is filled
with Highlight, the tab light is Highlight, corner accents are dropped, capsule lights are CanvasText.
Print: shadows and glows are dropped, corner accents are dropped, the selected segment keeps its thumb
with a grey outline.

**Do** give a new icon box one of the tile classes (or the same rule set) and let it inherit `--tone`.
**Don't** add a square status marker, a full-height square stripe or an idle animation to a shape.

---

## Shell

| Part | Markup / classes | Notes |
|---|---|---|
| App bar | `header.appbar` > `.appbar-start` (rail toggle, `.brand`) · `.appbar-center` (`.clock`, `.cmdk-btn`) · `.appbar-end` | 64 px, glass (blur) with a solid fallback. The centre is a container (`appbar-center`): when the end group grows it gives way first — dates < 340 px, clock < 270 px, search collapses to its icon < 200 px — so nothing collides with the brand. Tagline shows only ≥ 1680 px; on phones (< 480) the score pill, theme toggle and brand text step back (theme + language are also in the "More" sheet). |
| Rail | `nav.rail` > `.rail-group` > `.rail-group-label` + `.rail-item` (`.rail-icon`, `.rail-label`) | 232 px; `body.rail-collapsed` → 72 px icons. Labels are never truncated (wrap to two lines). 960–1279 px: 72 px; `body.rail-open` expands it as an overlay. Collapsed tooltips: the shell sets native `title`s while the rail is icon-only; `.rail-tip` is styled for a custom (fixed-position) tooltip if one is wanted later. Module codes are hidden in the rail. |
| Language switch | `.lang-switch` > `button.lang-opt[lang][aria-pressed]` | Fixed visual order "ع \| EN" in both directions. Active = raised pill. |
| Data chip | `.data-status` (positioned wrapper) > `button.data-chip[data-status]` (`.data-chip-icon`, `.data-chip-label`, `.data-chip-offline`) + `.data-popover` | Dashed = simulated. Popover: title, text, `dl`, list, `.data-popover-actions`. From 960 px it hangs under the chip (inline-end aligned). Below 960 px it is fixed under the app bar, 12 px from the end edge, its height stops above the tab bar and the bottom safe area, and it scrolls inside itself, so every action stays tappable on short and landscape phones. |
| Activity panel | `aside.activity-panel` > `.activity-head` (title, `.activity-mode`, `.feed-count`, `.activity-actions`: pause / `.activity-pin` / `.activity-close`) + `.activity-new-chip` + `ul.activity-list` + `.activity-foot` | Closed by default; `body.panel-open` slides it in over content (elev-3). ≥ 1680 px `body.panel-pinned` makes it a grid column (no shadow). `.activity-pin` hidden below 1680. `.activity-new-chip` sticks under the head while the reader is scrolled. Toggle: `.activity-toggle` + `.activity-count`. |
| Filters row | `.filters` > `.filters-group` | Quiet toolbar on the page plane. |
| Tab bar | `nav.tabbar` > `.tab-item` | < 960 px, solid surface, active = brand text + top bar. "More" opens a bottom sheet (`dialog.drawer.is-sheet`) with `.sheet-quick` (language + theme) and `.sheet-list`. |
| Background | `.backdrop` > `.bg-layers` > `.bg-ambient`, `.bg-grid`, `.bg-mark` (`svg`, `.bg-mark-caption`) | Modes on `html[data-bg]`; see tokens §6. |

**Don't** put new controls in the app bar without checking the 390 px budget; **don't** make the
activity panel a live region.

## Text roles

See tokens §2. `.view-head` holds `.code-tag` (mono module code, gold diamond) + `h1` (page size)
+ `.view-lead`. Use `.t-section` for in-page section titles and `.view-section` /
`.view-section-head` to group a heading with its content.

## Cards

`.card` > `.card-head` (`.card-titles`: `.card-code`, `.card-title`, `.card-sub`; `.card-actions`)
+ `.card-body` (+ `.card-foot`). Variants: `.is-hero` (one per screen: gold hairline + faint inner
light), `.is-framed` (curved nickel-orange corner accents, see Shape language; the default of
`components.card()`), `.is-plain` (nested, no shadow), `.is-compact`,
`.is-flat`, `.is-fill`, `.is-clickable` (hover border; otherwise cards do not react to hover),
`.card-body.is-flush` (tables edge to edge).
Edges (tokens §3.1): every top-level card and tile has the nickel-orange metal border and evenly
spaced laser comets round the whole frame (`js/ui/edges.js` appends one aria-hidden `span.edge-run`
overlay; lit hosts carry `data-edge="lit"`); nested and plain cards get a softer metal and no comets.
A host must be positioned (relative) for its comet row; do not style `.edge-run` from views. Don't put `overflow: hidden` on a card: use `overflow: clip` with
`overflow-clip-margin: var(--edge-w)` so the comet can run on the border.
Every card is a container (`@container card`): actions wrap below 380 px, low/medium priority table
columns hide below 720 / 520 px, lifecycle and priority list re-flow.

**Do** keep one primary action per card. **Don't** nest shadowed cards or add colour washes.

## Explainer hero (cockpit) — `section.card.is-framed.is-hero.ckh` (js/ui/explainer-hero.js)

The "How the platform works" video is the first card of `#/cockpit` (the home route), above the page heading.
Media and cues come from the generated manifest `js/data/explainer-media.js` (`EXPLAINER.langs.{ar,en}`: mp4,
poster, vtt, size, duration, `voice` = null or `{ name, provider, model }`, ten cues with `step` 0–6 / null and the
caption text); never hard-code file names or captions in the view.

Structure: `.ckh-media` (`.ckh-stage` 16:9 box: `img.ckh-poster` (width/height set, `srcset` 640 w / 1280 w,
`fetchpriority=high`, also preloaded by the pre-paint script on the home route), `video.ckh-video[playsinline][muted]
[preload=none]` (its box 1 px inside the poster's, so the poster stays the LCP element), `.ckh-shade` vignette,
`.ckh-big` play / replay, `.ckh-spin`, `.ckh-state` for the empty / error / offline states — nothing else sits over
the picture, so the burned-in captions are never covered) + `.ckh-controls` (`.ckh-rail[role=slider]` with seven
`.ckh-tick` step marks and the glowing `.ckh-dot` playhead; `.ckh-row`: play/pause, `.ckh-sound` (narrated files
only), the odometer clock `.ckh-time`, `.ckh-cc` captions (`aria-pressed`, off by default — captions are burned in),
language version, full screen)),
then `header.ckh-head` (kicker + duration, `h2`, lead, the voice note, collapse toggle) and `.ckh-chapters` (`h3`,
current-step `.ckh-chip`, `ol.ckh-cues` of ten `button.ckh-cue` — `aria-current` on the line on screen; a line seeks).
The transcript list carries `lang`/`dir` of the video version (it is the video's text alternative).

Layout: `main` < 880 px → stacked (video, then title, then the chip with the transcript folded behind
"Full transcript"); wider → one band, video on the inline-start side (≤ 560 px) and title + chapters on the
inline-end side, the chapters list scrolling inside the video's height (`contain: size`), so the band stays about
410 px tall and the executive metrics still show above the fold at 1440 × 900. The progress rail runs left → right
in both languages (media timelines are not mirrored); everything else mirrors. Targets: 38 px buttons, 24 px rail,
44 px on coarse pointers (rail, buttons including the sound prompt, cue lines). On phones (`main` ≤ 520 px) with a narrated
file the clock drops its "/ total" (the kicker shows the length), and while the sound prompt shows the clock and
the captions toggle step out of the row. The big play button's focus ring is white between two dark rings (visible
over light and dark frames). Collapsed (`.is-collapsed`, remembered in `localStorage`
`biltix-hse:explainer:collapsed`): a slim bar with "Play the video" and "Show video".

Playback: the `src` is attached only after `load` + an idle callback; autoplay (muted, unless the file is narrated and
the page has already had a gesture — see Sound below) unless `autoplayDecision()` says no (reduced motion —
`settings.motion: 'full'` overrides the OS —, `settings.motion: 'reduce'`, Save-Data, collapsed, or finished once in
this tab: `sessionStorage` `biltix-hse:explainer:finished`). It plays only while ≥ 35 % of the stage is on screen and
the tab is visible, and resumes by itself only when it was playing and the reader had not paused it. Below 960 px the
app bar and the tab bar are fixed over the page, so "on screen" leaves the strips they cover out (IntersectionObserver
`rootMargin` from `coveredInsets()`, re-measured on resize and full screen); while autoplay waits for the stage to
scroll into view it stays idle with the big play button (no spinner). A play the reader asks for while too little of
the picture shows (a play button: < 35 %; a transcript line: < 90 %) first scrolls the stage into view; the hero and
stage carry a `scroll-margin` of the bar heights below 960 px, so neither that nor the header button leaves the picture
under the app bar or the tab bar.
No loop; the end shows the replay state. Position, version and play intent survive a re-mount (language switch,
leaving and re-entering the cockpit); a stretch that started by itself goes through the policy again on re-mount
(`resumeDecision()`: motion turned down on `#/settings`, Save-Data …), one the reader started carries on. The header button "How the platform works" scrolls to the hero, expands it and
plays from the start with sound (a gesture). Sound: with a voice, unmuted play is tried when the page has had a gesture
(`navigator.userActivation.hasBeenActive`); a refusal falls back to muted play, and the sound button next to play/pause
becomes the prominent labelled pill "Turn sound on" (`.is-prompt`, primary look; under the picture, never over the
captions); one tap unmutes and it returns to an icon button whose speaker glyph gives way to equaliser bars while
sound plays. The note always says what the audio is: "AI-generated voice ·
<name> · <provider>" or "Silent — captions in picture". Errors: a missing file (HEAD 404) shows the "not available"
empty state offering the other version, a failed load the error state with retry, no network the offline state.

Motion (all compositor-only, all off under reduced motion — OS unless the setting forces it on — the motion setting
and forced colours, also when forced colours switch on while it plays; the video itself is content and follows the
autoplay policy): progress fill and playhead as one linear Web Animation per playing stretch; clock digits as
strips stepped by `steps()` transform animations; both re-synced from the media clock on play / pause / seek / rate
change and checked for drift at cue boundaries (the only main-thread wake-ups while playing, about every 4 s — no
`timeupdate` listener). One title light sweep per page load; equaliser bars only while sound plays. Under reduced
motion and forced colours the rail and clock step once per second instead. Print hides the hero (css/print.css).

**Do** keep captions burned in and the transcript complete; label any synthetic voice. **Don't** autoplay with
sound, loop, or put controls over the picture (they would cover the burned-in captions).

## Executive metrics — `.metric-grid` > `.metric-tile`

`a|button.metric-tile.tone-*` > `.metric-head` (`.metric-label`, `.metric-icon` or `.metric-info`)
+ `.metric-value` (`.t-metric` + `.metric-unit`) + a caption naming the ring's ratio + `.ck-gauge`
(ring gauge with radial weekly bars, see Charts) + `.metric-foot` (`.delta.is-good|is-bad|is-flat`
with arrow icon + `.metric-helper` comparison period). Four across ≥ 1080 px of content, 2 × 2 below.
(v3.1: the line `svg.metric-spark` and the completion tile's `.metric-progress` are no longer used by
the cockpit; the ring shows the same ratio.)
The tone sets the top capsule light (tapered, set into the top frame) and the squircle icon tile only —
the number stays `--ink-1`.
**Do** state the comparison period in `.metric-helper`. **Don't** colour the number.

## Domain cards — `.domain-grid` > `.domain-card[data-rating]`

`.domain-head` (`.domain-icon`, `.domain-name`, `.rating`) + `.domain-score` (`.t-metric` +
`.domain-scale` "/100", one LTR run, now centred in the dial) + `.ck-dial` (score/100 ring coloured
by the rating, 12 radial weekly bars; see Charts) + `.domain-meta` (`strong` counts) + optional
`.domain-foot`. Five across at ≥ 1240 px content, 3 / 2 / 1 below. The rating sets the 24 px capsule
light in the inline-start frame, level with the head; the rating badge carries icon + word.
`.domain-icon` is a brand-tinted squircle (a category, not a state).

## Badges

- `.badge.tone-*` (+ `.is-solid`, `.is-lg`, `.is-code`, `.is-square` = soft 7 px rectangle): generic
  labels, pills 22 px (`.is-lg` 26).
- `.rating.is-red|is-yellow|is-green` (or `[data-rating]`): risk rating with an icon.
- `.status-badge[data-status]` (`demo | live | offline | stale | error | not_connected`, also
  `.is-<status>`, `.is-sm`, `.is-lg`) > icon + `.status-badge-label`. Owns its colours; never add a
  `.tone-*` to it. Dashed border = simulated / not connected.
- `.sim-tag` / `.illustrative`: inline "Illustrative values / Simulated" marker next to demo numbers
  (dashed pill, 20 px).
- `.type-chip`, `.cat-chip`, `.source-chip`, `.writeback-chip[data-status]` (platform.css).

## Buttons — `.btn`

Variants: `.btn-primary` (one per view region), `.btn-secondary` / `.btn-outline` (surface button
with boundary), `.btn-ghost` (low emphasis), `.btn-danger` (+ `.is-soft`), `.btn-accent`,
`.btn-link`. Sizes: default (`--ctl-h`), `.btn-sm`, `.btn-lg`, `.btn-icon`, `.btn-block`; group:
`.btn-group`.
States: hover (`--btn-bg-hover`), `:focus-visible` (ring), pressed (`:active` nudge 1 px +
`--btn-bg-active`; toggles use `aria-pressed="true"` → brand-soft), `:disabled` /
`aria-disabled="true"` (45 % opacity, no hover), loading `aria-busy="true"` or `.is-loading`
(label kept for width, centred spinner, pointer events off).
**Do** give icon-only buttons an `aria-label`. **Don't** use danger for non-destructive actions.

## Forms

`.field` > `.field-label` (+ `.field-req`) + `.field-control` + `.field-hint` / `.field-error`.
Controls use `--input-bg` and a `--line-strong` boundary (≥ 3:1). States: hover (ink-3 border),
focus (ring + border `--focus`), invalid (`.field.is-invalid`, `[aria-invalid="true"]`,
`:user-invalid` → critical border + inset ring; message in `.field-error` with an icon),
disabled (dashed, 55 %), readonly (bg-2, quiet border). `select.field-control` draws a per-theme
chevron on the inline-end. `.input-icon` wraps a leading search icon. `.switch[role=switch][aria-checked]`,
`.form-grid` (auto-fit 220 px), `.form-actions`, `.form-section-title`, `.form-error-summary`.

**Note — native date / time inputs.** `input[type=date|time|datetime-local]` draw their text in a
format the browser chooses: it does not follow the app language or the numerals setting (Chromium
showed `11/10/2026` and `02:05 PM` on an Arabic page with Arabic-Indic numerals). Their `value` is
always ISO (`2026-11-10`, `14:05`). Do not copy an input's display format into other UI: format
displayed dates with `fmt` (`fmt.date`, `fmt.dateTime`, `fmt.time`, which show instants in Asia/Riyadh).

## Segmented, chips, tabs

- `.seg` > `.seg-btn[aria-pressed|aria-checked|aria-selected|.is-active]` (`.seg-sm`, `.is-block`): a
  recessed pill track with a raised thumb (light: white pill with a hairline ring and soft drop; dark:
  brand-tinted pill with a brand ring). The selected label is `--seg-on-ink` (brand text light, ink-1
  dark) at 600 weight. The radius is half of one row (`--seg-btn-h / 2 + --seg-pad + 1px`), so a group
  that wraps (filter bars and settings on phones) stays a rounded panel rather than a stadium.
  **Gliding thumb, CSS only:** each button's `::before` is a thumb. Hidden thumbs rest one button-width
  toward the selected button (`--seg-from`: +1 for buttons before it via `:has(~ …)`, −1 after it, times
  `--dir`). On a change the old thumb travels toward the new option while it fades (opacity ease-in) and
  the new one arrives from the old side while it appears (ease-out), both on `--ease-glide` in 220 ms, so
  the light moves from one option to the other on transform + opacity alone. Exact for neighbours; a
  jump across several options travels one width. The track has `contain: paint`, so a resting thumb at
  the end of a wrapped row never reaches past the track or widens the page, whatever `overflow` a view
  sets on the group. Size variants only set `--seg-pad` / `--seg-btn-h` (`.filter-bar .seg` is 2 /
  `--ctl-h-sm − 6`; coarse pointers 40 px).
- `.chips` / `.chip-group` > `.chip[aria-pressed]` (`.chip-count`, `.chip-remove`, `.is-sm`,
  `.chips.is-scroll` = single swipe row below 600 px; a filter-bar chip group marked
  `.chips.is-scroll` stays a swipe row at any width, other rows wrap from 600 px).
- Counts and auto-numbers (`.chip-count`, `.tab-count`, `.drawer-tab-count`, `.kanban-count`,
  `.priority-rank`, `.lifecycle-dot`, `.step-dot`) use `--font-mono-mixed`: IBM Plex Mono has no
  Arabic-Indic digits, so with `data-numerals="arab"` they come from the Plex Arabic face, not a system font.
- `.tabs` > `.tab[role=tab][aria-selected]` (+ `.tab-count`), and `.drawer-tabs` > `.drawer-tab`: the
  selected tab carries a 3 px brand → accent capsule light on the list hairline (`::after`, with a soft
  glow) plus ink-1 / 600 text; hover shows a rounded plate behind the label (`::before`). The light
  glides between tabs with the same resting-side rule as the segmented thumb (`--tab-from`, 240 ms).
  Focus ring: 2 px, inset 4 px, radius 10.

## Filter bar — `.filter-bar` (components.filterBar)

`.filter-bar` > `.filter-bar-group` (`.filter-bar-label` + select / `.seg` / `.chip-group`)* +
`.filter-bar-search` + `.filter-bar-spacer` + `.filter-bar-count` (brand pill, hidden when empty) +
`.filter-bar-reset` (ghost, disabled when nothing is filtered). Groups carry their type:
`.filter-bar-group.is-chips|is-select|is-segmented`; the search input gets a per-theme magnifier
(`--search-glyph`) at the inline-start. `.is-plain` drops the surface.
Below 640 px of content, groups pair up and search takes the full row; a segmented group takes its own
row and its `.seg` wraps its buttons (never a hidden scroll), so views need no per-view width patches.
**Do** place it directly above what it filters. **Don't** hide the active count.

## Tables — `.table-wrap` > `table.table`

Rows `--row-h` (46 px comfortable / 40 compact), sticky header (`--bg-1` dark, `--bg-2` light),
hairline rows, no zebra. Sorting: `th[aria-sort]` / `th.is-sorted` > `.sort-btn` (whole cell) +
`.sort-ic`. Cells: `.cell-title`, `.cell-sub` (secondary line, ink-3, 12 px), `.mono` codes,
`.align-end` numbers. Rows: `.is-clickable` (with `.row-open` button for keyboard), `.is-selected`,
`.is-critical` (inline-start stripe), `.is-flash` (set by `motion.flash()` for ~600 ms after a live
update: accent wash + inline-start accent bar; any other node gets an accent hairline + wash over its
own opaque background). Wrappers: `.is-paged`, `.is-scroll`, `.is-overflowing`
(scroll-edge shadows), `.table.has-sticky-first`, `[data-priority=low|medium]` columns, `.pager`.
`.table.is-dense` for embedded tables.

## Drawer — `dialog.drawer` (components.drawer)

`.drawer-backdrop` (solid scrim) > `dialog.drawer[.is-lg|.is-xl]` > `.drawer-head` (`.drawer-titles`:
`.drawer-title` 20 px, `.drawer-sub`; `.drawer-close`) + `.drawer-tabs[role=tablist]` >
`button.drawer-tab[role=tab][aria-selected]` (`.drawer-tab-label`, `.drawer-tab-count`) +
`.drawer-body` (container `drawer`; `.drawer-panel` tabpanels; `.drawer-section` +
`.drawer-section-title`) + `.drawer-foot` (sticky; `.is-start` pushes an action to the start).
Slides from the inline-end; `motion.drawer()` owns the transform (`[data-motion-owned]`). Phones: full
width. Bottom sheet: `.is-sheet`.
**Do** keep Overview / Evidence / Treatment / History as tabs; **don't** stack two drawers.

## Dialogs

`.modal-backdrop` > `dialog.modal[.is-sm|.is-lg|.is-xl]` > `.modal-head` + `.modal-body` +
`.modal-foot`. Elevation 3, radius 14, enters with a 10 px rise. Phones: bottom-aligned.
Escape closes the topmost modal or drawer, also when focus has fallen to `<body>`.

The explainer video is no longer a dialog: see "Explainer hero (cockpit)" (v3.6).

## Menus, tooltips, toasts

- `.menu` > `.menu-item` (+ `.tone-critical`), `.menu-sep`: solid surface, elev-2.
- Chart tooltip `#tooltip` (charts.css): bg-3 dark / white light. Static hints: `[data-tip]`
  (pure CSS, not inside scrolling containers). Collapsed rail: `.rail-tip`.
- `.toast-stack` > `.toast.tone-*.is-in` (`.toast-icon`, `.toast-text`: `.toast-title`,
  `.toast-msg`; `.toast-action`, `.toast-close`). Tone capsule light at inline-start. Toasts never claim a
  success that did not happen; simulated operations say "Simulated". While a modal or drawer is open,
  components.js docks `#toasts` inside the topmost dialog (`.toast-stack.is-docked`, in flow between the
  body and the footer): a toast never covers the dialog's controls and stays outside the inert page.
  It returns to `<body>` when the dialog closes. Docked, the stack is capped at 25 % of the viewport
  height (240 px at most) and scrolls on its own, newest first; toasts keep their full height. A new
  toast scrolls the stack back to the top unless keyboard focus is inside the stack. Below about
  375 px of viewport height the dialog body can be shorter than the stack.
  Dismissing a focused toast moves focus to the next toast, else back to the control it came from,
  else to the dialog, so Escape still closes the dialog. Before the stack moves, every toast that has
  probably been drawn at its old place (in the document for 50 ms, or past a drawn frame) loses its
  live role, so moving does not re-insert a live region that was already shown. A toast moved straight
  after it was raised keeps its role and is announced at its new place. Screen-reader speech itself has not been tested.

## Kanban

`.kanban` > `.kanban-col` (`.kanban-col-head`: a tapered capsule light in the column tone set into the
top frame over a faint tonal wash, live dot, `.kanban-col-title`, `.kanban-count` pill)
> `.kanban-cards` > `.kanban-card[.tone-*]` (`.kanban-card-bar`, `.kanban-card-title`,
`.kanban-card-meta`, `.kanban-card-foot`; a 22 px capsule light by the card head). States: `.is-over` (drop target), `.is-dragging`;
overflow fade via `.is-overflowing` + `.is-scroll-start|end`; `.kanban-hint`.

## States — empty, loading, error, offline, skeleton

`.state.state-loading|state-error|state-offline` > `.state-icon` (squircle tile: brand while loading,
critical on error, dashed neutral offline) + `.state-title` + `.state-text`
(+ `.state-detail` mono, `.state-actions` > `.state-action`). Variants: `.is-compact`, `.is-inline`
(row, for inside cards), `.is-cancelled`. Legacy `.empty` shares the look. `.skeleton` >
`.skeleton-line` (finite pulse, static under reduced motion; `.skeleton.is-card`, `.skeleton-block`).
`.spinner` (`.is-lg`) exists only while busy.
**Do** write an empty state that says why it is empty and what to do. **Don't** show a spinner
for data that is already local.

## Priority actions — `ol.priority-list` > `li.priority-item.tone-*`

`.priority-rank` (squircle number tile in the row's tone; auto-numbered, Arabic-Indic with
`data-numerals="arab"`; the number keeps ≥ 4.5:1 on the tile in both themes) + `.priority-main`
(`.priority-title`, `.priority-meta`) + `.priority-side` (`.rating`, `.priority-due[.is-overdue]`) +
optional `.priority-action`. Rows ≥ 60 px; re-flows in narrow cards.

**Note — put `.priority-item` on the `<li>`.** The class (with `.tone-*`, `.is-clickable`,
`.is-overdue`) goes on the list child itself, not on an `<a>` or `<button>` inside the `<li>`: the row
separator is removed by `.priority-item:last-child`, and an `<a>` that is the only child of its `<li>`
is always `:last-child`, so every separator disappears. For a clickable row use
`li.priority-item.is-clickable` and put the link / button inside `.priority-main` or `.priority-action`.

## Lifecycle — `ol.lifecycle` > `li.lifecycle-step[data-state]`

Twelve stages (source → validation → identification → analysis → evaluation → recommendation →
human review → assignment → escalation → treatment evidence → residual assessment → closure &
audit). `data-state="done|current|pending|skipped"` (or `.is-*`). `.lifecycle-dot` (empty = auto
number, or an icon) + `.lifecycle-text` (`.lifecycle-label`, `.lifecycle-meta` for at/by) +
optional `.lifecycle-action`. Horizontal in wide cards (scrolls if needed); 2-column list in cards
< 760 px; vertical timeline in drawers, with `.is-vertical`, and on phones. Done/current use brand
(lifecycle progress is not a risk state); skipped = dashed.

## Evidence attachments — `ul.evidence-list` > `li.evidence-item[data-kind]`

`data-kind="link|note|file"` > `.evidence-icon` (squircle: neutral note, brand link, accent file) + `.evidence-body` (`.evidence-title` — an `a` for
links, `.evidence-meta`) + `.evidence-local` ("Local only", dashed pill) + `.evidence-actions`. Adding:
`.evidence-add`, `.evidence-dropzone[.is-over]`. Platform evidence quotes: `.evidence`
(`.evidence-ref`, `.source-chip`, `.evidence-excerpt` with «» in Arabic, “ ” in English).

## Charts (charts.css)

Text in ink tokens only (never series colours); hairline grid; tooltips on hover + focus; every
chart has a table twin (`.chart-table`). Heatmap: `.matrix` / SVG `rect.cell` with
`.is-selected` / `[aria-pressed]` focus ring; legend `.matrix-legend` or `.heatmap-legend`
(`.heatmap-legend-item` > `.heatmap-legend-swatch[--key]` + label, or `.heatmap-legend-ramp`).
Dumbbell (inherent → residual, one axis): `g.dumbbell-row` > `line.dumbbell-link` +
`circle.dumbbell-from` (hollow) + `circle.marker.dumbbell-to` (colours set inline by charts.js);
hover / focus thickens the link; `.is-unassessed` rows (no residual yet) draw a dashed link and
ring. Legend key for the hollow marker: `.legend-key.is-ring`. Radar frames: `.radar-status`
(top inline-start) and `.radar-caption` (bottom inline-end, `unicode-bidi: plaintext` so Latin
captions read LTR without moving the chip). Sparklines: `.spark`
(`.is-up`, `.is-down` use the status text tokens). Segmented bar (`.chart-segbar`): inside value labels
use the better of the two inks for the segment's own fill, or an opaque plate when neither reaches
4.5:1; hover / focus / active draw a ring and never brighten or dim a fill, so the label keeps that
contrast in every state (labels that do not fit are dropped; tooltip and table carry the value).

**Ring gauge** (`charts.ringGauge`, v3.1) replaces the line sparkline inside the cockpit's executive
metric tiles and domain cards. `span.ring-gauge[data-size][data-tone][data-state]` (aria-hidden, fixed
square box: `sm` 64, `md` 80, `lg` 104, `xl` 120 px, so nothing shifts when data arrives) draws:
- a **ring** for one honest ratio, 0 to 1 (`gaugeRatio(part, whole)`; a zero or unknown whole gives
  `value: null` and the empty state: dashed neutral track, no arc, centre "—"). The cockpit uses the
  numbers the tile already shows: open risks = open of the period's risks (open, plus closed or
  dismissed in the period: `psel.metrics().openRisks` of `psel.registerRows().length`), critical =
  red of open, overdue = overdue of open mitigation actions (total minus closed), completion = closed
  of all actions, domain card = score of 100 in the rating tone (the rating badge keeps icon + word);
- **radial bars** around it, one per week (`gaugeBars(values, { max })`): oldest first, length
  proportional to the value from zero (fixed `max` 100 for scores and percentages, otherwise the
  highest week is full length), unknown weeks keep an empty slot, the current week is the tone colour
  and slightly wider, earlier weeks a lighter step of the same hue;
- an optional centre value (the ring's own percentage; on domain cards the card's visible score sits
  in the centre instead, outside the aria-hidden gauge).
The ring is named in the gauge's `title` (ratio + how to read the bars) and, on tiles, in a visible
caption under the number ("of 58 open risks"); each tile and card carries an sr-only sentence with the
ring value and the trend (`trendSentence`: "Last 12 weeks: from 7 to 23, rising.").
**Geometry and direction:** a dial, so ring progress and bar order run clockwise from 12 o'clock in
both Arabic and English (the root is `direction: ltr`; only the centre text follows the document
direction). **Motion:** HTML layers only, Web Animations on `transform` / `opacity` (composited, no
per-frame paint): the ring is two half-rings rotating inside half-width clips plus a rotating end cap,
driven by one set of sampled keyframes with an exact keyframe at 180° (`ringKeyframes`); the bars
scale along their length (`scaleY`, origin at the inner end). Entrance once per render, when the
gauge is first on screen: 900 ms ease-out sweep with the centre counting in step, bars growing 32 ms
apart. Later values (filters, live data) animate from the shown value to the new one in 620 / 300 ms
and never replay the entrance. Idle: one soft sheen orbits the ring every 11 s (transform only), only
while the gauge is on screen; none under reduced motion (OS or setting), the Static background or
forced colours. Print settles every gauge to its final state (`beforeprint`) and hides the sheen.
**Do** pass ratios computed from the same selector values the tile shows. **Don't** use the gauge for
a value without a meaningful whole, and don't colour-code it without a text or badge equivalent.

**Radar trend** (`charts.radarTrend`, v3.2.1) replaces the line chart in the trend cards: the cockpit's
"Risk trend — 12 weeks" (open risks, consolidated score: one radar each), the incident trends of
`#/incidents` and `#/overview`, and the report's RPT-03A. It is a drop-in for `lineChart`: same options
(`series [{ id, label, color, values }]`, `labels`, `height`, `yFormat`, `area`, `ariaLabel`, `xLabel`)
and the same return value (`{ el, update(data), table(), destroy() }`), so a call site switches by name.
- **Geometry (a dial, identical in Arabic and English):** one spoke per period; the **oldest period is at
  12 o'clock and the periods run clockwise**, so the latest sits just before 12 (a short tick outside the
  rim marks the start). The radius is the value on a **linear scale from zero**; rings at a nice step
  (1, 2, 2.5 or 5 × 10ⁿ, at most four rings, whole numbers only for counts) are labelled through
  `yFormat`, along the bisector of two spokes that the data leave free. Negative values sit at the centre;
  the tooltip and the table keep the exact number. Only the period labels follow the document direction.
- **Marks:** each series is a polygon with a soft radial gradient in its colour (denser toward the rim), a
  2 px outline over a faint glow, and 8 px point markers with a surface ring. A dashed **seam** marks joins
  that are not one measured step: the closing edge from the latest period back to the first, and any join
  across an unknown period. The latest point of each series is larger, with a halo, and carries its value
  in a pill placed clear of labels and markers. Several series overlay with lighter fills and a legend
  (dot keys); one series has no legend.
- **Labels:** period labels round the rim are measured and thinned with an even stride counted back from
  the latest (latest and first always win when they fit; never overlapping, never outside the box); the
  dial shrinks a little rather than drop below four labels. `height` is the block size; a container wider
  than 1.8 × height lets the dial grow to at most 1.3 × height.
- **Honest states:** no series, no periods or no known value → "No data" over dashed rings; a single known
  period → its point plus a note ("Only one period has data so far"), no shape; unknown periods keep their
  spoke with no point.
- **Interaction:** hover anywhere in a period's wedge, or Tab to the chart (one tab stop) and move with the
  arrow keys (Right / Down = next period clockwise, Left / Up = previous, Home / End), to see the wedge,
  its spoke, a ring on each series point and the tooltip listing every series (value first). An sr-only
  sentence explains how to read the dial; the card's "Table" view keeps the exact numbers.
- **Motion:** HTML layers (grid, sweep, one per series shape, points, value pills) under the interactive
  svg, animated with Web Animations on `transform` / `opacity` only. Once per render, when about 40 % of
  the chart is first on screen: the rings fade in (640 ms), one radar sweep passes clockwise (960 ms; not
  under the Static background), each polygon grows from the centre (820 ms ease-out, series 110 ms apart),
  the points pop in clockwise 32 ms apart and the value pills fade in last. A data update morphs the shape
  from the shown values to the new ones in one 520 ms tween (path `d` and point positions are written only
  during that tween); a view that rebuilds the chart on live data gets the same morph instead of a second
  entrance (the last shape is remembered per chart while it is on the page). No idle motion. Reduced
  motion (OS or setting): final state, no animation. Print: final state (`beforeprint` settles any pending
  entrance or morph, important print rules outrank any running animation, the sweep is hidden). Paper is laid
  out without ResizeObserver, so the HTML point and pill layers are hidden in print and SVG twins drawn inside
  each series layer (`g.rt-print`) print instead: they share the dial's viewBox and stay registered with it.
**Do** keep the table view beside it for exact values, and use it for regular periods (weeks, months).
**Don't** use it for categories without an order (use bars), or for more than four overlaid series.

Legend keys (`.legend-key`) are soft rounded markers: a 10 px rounded square with a top-light sheen and a
faint halo in the series colour; `.is-line` is a 16 × 4 px pill, `.is-dot` a 9 px dot; table key cells
use the same marker. The label beside each key always carries the identity.

## Print (css/print.css)

A4, 16 mm margins, page numbers ("n / N") from page 2. Chrome, background layers, filters and
buttons are hidden; light tokens forced; cards and table rows never split; table headers repeat;
every table column prints. Use `.report-only` for cover / signature blocks, `.print-break` for
page breaks, `.print-hide` to drop a block. Arabic and English both print with the self-hosted
Plex faces (no network font needed for PDFs).
