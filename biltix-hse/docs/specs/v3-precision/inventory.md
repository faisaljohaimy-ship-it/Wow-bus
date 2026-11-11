# BILTIX Risk AI v3 — functional inventory

Status of every user-facing function on branch `claude/biltix-precision-v3` at `da1fbc3` (v3.5.1). This
is a static demo: all records are seeded in this browser, and nothing talks to a real BILTIX, Primavera P6,
Autodesk APS, Oracle, sensor, camera or model service.

| Status | Meaning |
|---|---|
| **Complete** | Works end to end in this static app; behaviour is final for the agreed scope |
| **Partial** | Works, with a stated limit or a known defect |
| **Demo** | Interface works over seeded or simulated data; real data needs a connection that is not built |
| **Not connected** | Needs a backend or a third-party connection that does not exist; the UI says so |
| **Broken** | Known not to work (see the rows marked Broken and "Verification" below) |

Evidence column: **U** unit test in `tests/` · **Q** `tools/qa.mjs` browser smoke (routes × AR/EN × themes ×
widths) · **P** scripted interaction probe during development · **R** coordinator review · **C** independent
check workflow at publish time · **V** final verification on 2026-11-11 (measurements and independent
checks; see `acceptance.md`). Probe, check and QA artefacts are in the session scratchpad, not in the
repository.

## Shell and settings

| Function | Status | Notes | Evidence |
|---|---|---|---|
| Arabic / English switch (app bar, Settings), persisted, `html[lang][dir]` | Complete | **English is the default** (v3.7.1, `780c621`); settings saved before that open in English unless Arabic was chosen explicitly (`settings.langChosen`). Survives reload; deep links keep the language. After the first switch the rail plate can sit 12 px off (see "Cinematic shell") | Q P V |
| Numerals (Latin / Arabic-Indic) independent of language | Complete | Codes and IDs stay Latin | P U V |
| Calendar (Gregorian / Hijri / both) | Complete | Drives the app-bar date | P |
| Times shown in Asia/Riyadh | Complete | Calendar days are formatted from their own date | U |
| Theme light / dark, density, motion (auto / reduce / full) | Complete | **Light is the default** (`3ce0c0f`); settings saved before that open in light unless dark was chosen explicitly. Respects `prefers-reduced-motion` | Q P U V |
| Background Static / Subtle / Cinematic | Complete | Data sits on opaque surfaces in every mode; the cinematic mode adds slow light shafts (v3.4) | Q R V |
| Cinematic shell: app bar, gliding navigation indicators, depth route transitions (v3.4, `870d454`) | Partial | Input is never blocked and focus lands on the new h1. Reduced motion removes every transition. **Regression:** on the first language switch the rail plate is placed before the new webfonts load, and on #/reports and #/settings it stays 12 px off the active item until the next navigation or resize. Two smaller defects: the route afterimage is not always shown exactly where the content was read (2–10 px offsets logged at 390×844) | V |
| Card edges: nickel-orange metal with laser comets round the whole frame (v3.1–v3.1.1) | Complete | 3–12 comets per card (kanban at most 3), transform-only Web Animations, played only on screen. Off with reduced motion, the Static background, forced colours and print. Idle cost 10.6–15.3 ms of main thread per second (`docs/design/tokens.md` §3.1) | P V |
| Guide shapes: corner accents, squircle icon tiles, gliding segmented thumb, capsule status lights, pills (v3.5.0) | Complete | Independent check not refuted. Latent notes: a nested framed card draws corner arcs, and a hidden calendar segmented thumb sits beyond its track (clipped) | C Q |
| New-version notice | Complete | `<meta name="biltix-build">` stamped by `tools/stamp-build.mjs`. An open page compares it on returning to the tab and every 5 minutes, and offers a Reload toast (AR / EN) | P |
| Global Demo badge and status taxonomy | Complete | `js/core/status.js`; no "Connected" claim for simulated sources | U Q |
| Activity panel (collapsible) | Demo | Events are simulated and labelled so | P |
| Domain weights editor (sum 100 %, inline validation) | Complete | Changes the cockpit score; written to the audit log; cockpit link lands on it | P U V |
| Thresholds editor (critical ≥ alert + 5) | Complete | Effect preview on open risks | P U |
| Data source set-up (JSON URL, Google Sheets, Supabase) with test | Partial | Real request from the browser; result recorded honestly; no server-side proxy, so CORS-blocked sources fail | P |
| Import JSON / CSV with per-row validation preview | Complete | Commits valid rows only; cancellable; offline and error states | P U |
| Backup export / validated restore / reset | Complete | This browser only | P |
| Webhook test (Notifications) | Partial | Real POST from the browser reports accepted / opaque / failed; forwarding of alerts needs a backend | P |
| Identity card (brand colours, logo) and sound toggle | Removed | Not in the v3 brief; nothing played sound | — |

## Risk cockpit and AI risk register

| Function | Status | Notes | Evidence |
|---|---|---|---|
| Cockpit A–F (heading, metrics, domain cards, analysis, priority actions, register) | Demo | All figures from `psel.*` over seeded data | Q P |
| Ring gauges with radial weekly bars (metric tiles, domain cards; v3.1) | Complete | Replace the sparklines. Unknown totals show an empty state, never a fake 0 % or 100 %. Tooltip on hover; forced-colours tone. Cosmetic: phone tiles about 50 % taller; the Arabic completion helper wraps at 1440 | U Q C |
| Radar trend charts (cockpit, incidents, overview, reports; v3.3) | Partial | Replace the trend line charts. Values, rim labels, legend, empty and one-point states, keyboard, accessible names and print checked on 120 loads; accessible text and table views identical to the line charts. **Known defects:** in Arabic the grid layer drifts 40–120 px from the series while a resize redraw is pending (`js/ui/charts.js:3051`); a chart whose entrance is pending off screen shows its final state, then regrows. Already the case with the line charts: the svg root is an extra tab stop, and chart labels shrink to about 3–4 px in narrow print columns | U Q V |
| Filters (domain, rating, status, owner, search) update every section | Complete | URL state via `replaceState`; bilingual search | P U |
| L × I matrix: cell opens matching records; inherent / residual toggle; keyboard | Complete | Roving tabindex; table view | P U |
| Register rows: open the drawer by clicking a row | **Broken** | Clicking any cell other than the first-cell opener does nothing: `<main tabindex="-1">` matches `[tabindex]` in `INTERACTIVE` (`js/ui/components.js:626`), so the row listener (`:762`) always returns early. The `.row-open` button and the keyboard work. Affects every clickable table (AI register, cockpit register, HSE register and others) | V |
| Risk drawer: Overview / Evidence / Treatment / History | Complete | Severity, model confidence and input-data quality shown separately | P U |
| Lifecycle actions (accept, override, dismiss, assign, residual, close, reopen) | Complete | Guards from `store.aiRiskTransitions` | P U |
| Escalation | Not connected | "Simulated — not sent" | P |
| Evidence attachments | Partial | Stored on this device only, labelled | P U |
| Register risk form (required L / I, no preselection, due not in past) | Complete | | P U |
| Explainer hero at the top of the cockpit (AR / EN versions, poster first, autoplay after load + idle — muted unless the page has had a gesture — with the reduced-motion / Save-Data / minimised / already-watched exceptions, custom controls, seven-step progress rail, chapters + transcript, minimise remembered) | Complete | 41.5 s cut, 0 single-frame drop-outs, Demo-data chip on every frame. AI-narrated since v3.6 (ElevenLabs eleven_multilingual_v2: Arabic and English voices, −16 LUFS); the UI offers sound with an "AI-generated voice" disclosure. WebVTT track off by default (captions are burned in). See Q2 on the Remotion licence | U P Q R C |
| Model confidence values | Demo | Labelled "Illustrative" | R |

## Tasks and alerts

| Function | Status | Notes | Evidence |
|---|---|---|---|
| Tasks board / list, create, edit, assign, guarded moves | Complete | Close needs an outcome; Overdue only after due | P U |
| Write-back to BILTIX PM | Not connected | Labelled simulated, with retry | P |
| Alert queues, acknowledge, open risk | Demo | Alerts come from seeded / simulated events | P U |
| Alert channels (e-mail, SMS, Teams) | Not connected | "Only the routing is recorded" | P |

## Domain modules

| Module | Status | Notes | Evidence |
|---|---|---|---|
| Contracts (flags, obligations, legal referral) | Demo | Duplicate-referral guard; tasks carry English fields | Q P |
| BOM / procurement | Demo | Procurement task creation | Q P |
| Schedule (Monte Carlo, weather) | Demo | Forecasts "Illustrative"; weather "Simulated", production source not connected | Q P |
| Cost (EVM, forecast) | Demo | No live Oracle | Q P |
| Roadmap (months 0–4, payment split entered by the user) | Partial | Durations "to be agreed"; payment percentages are user-entered, not invented. axe: the Gantt grid misses required ARIA parent/child roles (2 critical nodes per page) | Q P V |

## HSE pillar

| Module | Status | Notes | Evidence |
|---|---|---|---|
| HSE overview | Demo | Metrics from `sel.*`; stat tiles carry radial trends; the trend card is a radar chart | Q P |
| Radar (sensors) | Demo | Simulated feed; a missing sensor shows "No sensor", never 0 | Q P U |
| Site spatial view (SEC-12) with simulated site cameras | Demo | Engineering-style plan per site linking zones to risks, sensors, cameras, permits, incidents and inspections, with one count definition shared with the registers. Deep links from the AI and HSE registers; prints the whole plan. Cameras are drawn procedurally in the browser (`js/ui/camfeed.js`) and labelled "Simulated feed; the camera is not connected". **Open observations from the final artefacts:** zones-table headers overflow their column by 1–23 px at 360–430; the zoom-fit control covers a zone name in 22 of 420 plan states probed at 768–1440; closing the command palette from a dirty zone panel returns focus to the palette button; camera targets are 24 px or larger, which is below the 40 px goal. See `docs/design/spatial.md` | U Q V |
| HSE risk register and drawer | Complete | Over seeded data; residual ≤ inherent. Row click: see "Register rows" (Broken) | Q P |
| Incidents (report, investigate, close guard) | Complete | Close refused while actions are pending; future dates rejected; trend card is a radar chart | Q P |
| Permits (kanban, gas test, expiring list) | Demo | Permit windows re-anchor to "now" | Q P |
| Inspections, training, compliance | Demo | Counts agree with the report | Q P |
| Reports (AR / EN, PDF, CSV, JSON) | Complete | One definition per metric; direction words follow the delta sign; trend is a radar chart with a print twin | U Q P V |

## Platform

| Function | Status | Notes | Evidence |
|---|---|---|---|
| Integrations page (connector status, filters) | Not connected | Every enterprise connector shows Demo or Not connected; "Sync now" removed; cards carry radial trends | Q P |
| Connector "Test connection" | Partial | Only for JSON / Sheets / Supabase / webhook; never turns a connector Live | P U |
| Data quality (rules, quarantine) | Demo | Rule toggles and decisions written to the audit log in both languages | Q P U |
| Engine (pipelines, stages, audit) | Demo | Precision, recall, calibration and drift show "Not measured" | Q P R |
| Retrain / pause model | Not connected | Disabled: "requires a connected model service" | P |

## Not built (out of scope or awaiting a decision)

- Multi-user storage, authentication, role-based access, server-side connectors and signed webhooks (Q4).
- Offline mode, QR workflows, CAD/BIM viewers, 360° capture (Q1).
- Real site cameras. The 8 Higgsfield camera stills that were generated could not be downloaded (blocked
  by the network policy, then by the session permission classifier), so they are not in the app.
- Production deployment under BILTIX authorization (Q3). Production was published on the user's
  instruction on 2026-11-10 and 2026-11-11 (10 deployments; v3.5.0 `af18f77` is live). The v3.5.1
  deployment was refused by the Vercel Hobby daily limit.

## Verification

Final verification of `da1fbc3` (v3.5.1) on 2026-11-11, Chromium 153 only, on a shared 4-vCPU sandbox.
Full evidence and statuses: `acceptance.md` (13 Met · 4 Partly met · 2 Not met · 0 Blocked).

- **Unit tests:** `node tests/run.mjs`: 104 passed, 0 failed (18 files).
- **QA matrix:** `tools/qa.mjs`, 23 routes × ar, en × light, dark × 360, 390, 430, 768, 1024, 1440, clock
  frozen at 2026-11-10T09:00:00+03:00. **552 of 552 loads pass**, with 0 console or page errors, 0 failed
  requests, 0 blank canvases, 0 horizontal overflow, 0 Arabic text on English pages, and lang/dir/theme
  correct everywhere. The QA does not detect clipped or overlapping content.
- **Lighthouse (median of 3):** desktop Performance 91–93, Accessibility 100, LCP 1.40–1.59 s, CLS 0.013
  (passes AC-16). Mobile Performance 49–60 and LCP 7.3–8.1 s (**fails AC-16**; baseline 85–89 and about
  3 s). The LCP element is view text drawn after boot. Same-session controls rule out the machine.
- **axe:** on the baseline scope, violation nodes fell from 201 to 48, and color-contrast from 131 to 0. On
  all 23 routes there are 724 nodes: 428 serious (label-content-name-mismatch), 8 critical (roadmap ARIA),
  16 moderate and 272 minor (**fails AC-17**).
- **CLS on load:** 184 loads, maximum 0.0345. **Interaction proxy:** median 64–96 ms without CPU
  slowdown, 216 ms at 4×. Field INP not measured.
- **Independent checks:** radar trend charts not refuted, with two new defects (Arabic layer drift during
  a pending resize redraw; final-state flash before the entrance). Cinematic shell refuted by the
  rail-plate regression after a language switch, plus afterimage offsets. Guide shapes and explainer fix2
  were not refuted at publish time.
- **Known broken:** whole-row click in clickable tables (see "Register rows").
- **Not tested:** WebKit / Safari and real devices (the WebKit download is blocked by the network policy),
  real screen readers, field INP.
