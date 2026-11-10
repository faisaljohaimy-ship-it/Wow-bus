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

---

## Shell

| Part | Markup / classes | Notes |
|---|---|---|
| App bar | `header.appbar` > `.appbar-start` (rail toggle, `.brand`) · `.appbar-center` (`.clock`, `.cmdk-btn`) · `.appbar-end` | 64 px, glass (blur) with a solid fallback. The centre is a container (`appbar-center`): when the end group grows it gives way first — dates < 340 px, clock < 270 px, search collapses to its icon < 200 px — so nothing collides with the brand. Tagline shows only ≥ 1680 px; on phones (< 480) the score pill, theme toggle and brand text step back (theme + language are also in the "More" sheet). |
| Rail | `nav.rail` > `.rail-group` > `.rail-group-label` + `.rail-item` (`.rail-icon`, `.rail-label`) | 232 px; `body.rail-collapsed` → 72 px icons. Labels are never truncated (wrap to two lines). 960–1279 px: 72 px; `body.rail-open` expands it as an overlay. Collapsed tooltips: the shell sets native `title`s while the rail is icon-only; `.rail-tip` is styled for a custom (fixed-position) tooltip if one is wanted later. Module codes are hidden in the rail. |
| Language switch | `.lang-switch` > `button.lang-opt[lang][aria-pressed]` | Fixed visual order "ع \| EN" in both directions. Active = raised pill. |
| Data chip | `.data-status` (positioned wrapper) > `button.data-chip[data-status]` (`.data-chip-icon`, `.data-chip-label`, `.data-chip-offline`) + `.data-popover` | Dashed = simulated. Popover: title, text, `dl`, list, `.data-popover-actions`; anchored under the chip (inline-end aligned). |
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
light), `.is-framed` (quiet CAD corner brackets), `.is-plain` (nested, no shadow), `.is-compact`,
`.is-flat`, `.is-fill`, `.is-clickable` (hover border; otherwise cards do not react to hover),
`.card-body.is-flush` (tables edge to edge).
Every card is a container (`@container card`): actions wrap below 380 px, low/medium priority table
columns hide below 720 / 520 px, lifecycle and priority list re-flow.

**Do** keep one primary action per card. **Don't** nest shadowed cards or add colour washes.

## Executive metrics — `.metric-grid` > `.metric-tile`

`a|button.metric-tile.tone-*` > `.metric-head` (`.metric-label`, `.metric-icon` or `.metric-info`)
+ `.metric-value` (`.t-metric` + `.metric-unit`) + optional `svg.metric-spark` + `.metric-foot`
(`.delta.is-good|is-bad|is-flat` with arrow icon + `.metric-helper` comparison period) + optional
`.metric-progress`. Four across ≥ 1080 px of content, 2 × 2 below (spark hidden < 560 px).
The tone sets the top accent bar and icon only — the number stays `--ink-1`.
**Do** state the comparison period in `.metric-helper`. **Don't** colour the number.

## Domain cards — `.domain-grid` > `.domain-card[data-rating]`

`.domain-head` (`.domain-icon`, `.domain-name`, `.rating`) + `.domain-score` (`.t-metric` +
`.domain-scale` "/100", one LTR run) + `.domain-meta` (`strong` counts) + `.domain-spark` +
optional `.domain-foot`. Five across at ≥ 1240 px content, 3 / 2 / 1 below. The rating sets the
inline-start stripe; the rating badge carries icon + word.

## Badges

- `.badge.tone-*` (+ `.is-solid`, `.is-lg`, `.is-code`, `.is-square`): generic labels.
- `.rating.is-red|is-yellow|is-green` (or `[data-rating]`): risk rating with an icon.
- `.status-badge[data-status]` (`demo | live | offline | stale | error | not_connected`, also
  `.is-<status>`, `.is-sm`, `.is-lg`) > icon + `.status-badge-label`. Owns its colours; never add a
  `.tone-*` to it. Dashed border = simulated / not connected.
- `.sim-tag` / `.illustrative`: inline "Illustrative values / Simulated" marker next to demo numbers.
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

- `.seg` > `.seg-btn[aria-pressed|aria-checked|aria-selected]` (`.seg-sm`, `.is-block`). Dark:
  brand-tinted selection; light: raised white pill.
- `.chips` / `.chip-group` > `.chip[aria-pressed]` (`.chip-count`, `.chip-remove`, `.is-sm`,
  `.chips.is-scroll` = single swipe row below 600 px; a filter-bar chip group marked
  `.chips.is-scroll` stays a swipe row at any width, other rows wrap from 600 px).
- Counts and auto-numbers (`.chip-count`, `.tab-count`, `.drawer-tab-count`, `.kanban-count`,
  `.priority-rank`, `.lifecycle-dot`, `.step-dot`) use `--font-mono-mixed`: IBM Plex Mono has no
  Arabic-Indic digits, so with `data-numerals="arab"` they come from the Plex Arabic face, not a system font.
- `.tabs` > `.tab[role=tab][aria-selected]` (+ `.tab-count`): underline tabs for page / card views.

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

**Explainer video** — `dialog.modal.video-dialog` > `.modal-body` > `.video-frame` (16:9, near-black)
holding `video[controls]` (captions styled via `::cue`) or `button.video-poster` (`img` +
`.video-play`) until the user presses play; `.video-meta` (`.video-duration`, `.video-langs`,
`.video-note`). Inline teaser: `.video-teaser`. Never autoplay with sound.

## Menus, tooltips, toasts

- `.menu` > `.menu-item` (+ `.tone-critical`), `.menu-sep`: solid surface, elev-2.
- Chart tooltip `#tooltip` (charts.css): bg-3 dark / white light. Static hints: `[data-tip]`
  (pure CSS, not inside scrolling containers). Collapsed rail: `.rail-tip`.
- `.toast-stack` > `.toast.tone-*.is-in` (`.toast-icon`, `.toast-text`: `.toast-title`,
  `.toast-msg`; `.toast-action`, `.toast-close`). Tone stripe at inline-start. Toasts never claim a
  success that did not happen; simulated operations say "Simulated". While a modal or drawer is open,
  components.js docks `#toasts` inside the topmost dialog (`.toast-stack.is-docked`, in flow between the
  body and the footer): a toast never covers the dialog's controls and stays outside the inert page.
  It returns to `<body>` when the dialog closes. Docked, the stack is capped at 25 % of the viewport
  height (240 px at most) and scrolls on its own, newest first; toasts keep their full height.
  Dismissing a focused toast moves focus to the next toast, else back to the control it came from,
  else to the dialog, so Escape still closes the dialog. A toast older than 1 s loses its live role
  before the stack moves, so moving does not re-insert a live region that was already shown.

## Kanban

`.kanban` > `.kanban-col` (`.kanban-col-head` with tone top bar, `.kanban-col-title`, `.kanban-count`)
> `.kanban-cards` > `.kanban-card[.tone-*]` (`.kanban-card-bar`, `.kanban-card-title`,
`.kanban-card-meta`, `.kanban-card-foot`). States: `.is-over` (drop target), `.is-dragging`;
overflow fade via `.is-overflowing` + `.is-scroll-start|end`; `.kanban-hint`.

## States — empty, loading, error, offline, skeleton

`.state.state-loading|state-error|state-offline` > `.state-icon` + `.state-title` + `.state-text`
(+ `.state-detail` mono, `.state-actions` > `.state-action`). Variants: `.is-compact`, `.is-inline`
(row, for inside cards), `.is-cancelled`. Legacy `.empty` shares the look. `.skeleton` >
`.skeleton-line` (finite pulse, static under reduced motion; `.skeleton.is-card`, `.skeleton-block`).
`.spinner` (`.is-lg`) exists only while busy.
**Do** write an empty state that says why it is empty and what to do. **Don't** show a spinner
for data that is already local.

## Priority actions — `ol.priority-list` > `li.priority-item.tone-*`

`.priority-rank` (auto-numbered, Arabic-Indic with `data-numerals="arab"`) + `.priority-main`
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

`data-kind="link|note|file"` > `.evidence-icon` + `.evidence-body` (`.evidence-title` — an `a` for
links, `.evidence-meta`) + `.evidence-local` ("Local only", dashed) + `.evidence-actions`. Adding:
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

## Print (css/print.css)

A4, 16 mm margins, page numbers ("n / N") from page 2. Chrome, background layers, filters and
buttons are hidden; light tokens forced; cards and table rows never split; table headers repeat;
every table column prints. Use `.report-only` for cover / signature blocks, `.print-break` for
page breaks, `.print-hide` to drop a block. Arabic and English both print with the self-hosted
Plex faces (no network font needed for PDFs).
