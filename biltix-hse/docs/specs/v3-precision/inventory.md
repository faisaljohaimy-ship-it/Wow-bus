# BILTIX Risk AI v3 — functional inventory

Status of every user-facing function on branch `claude/biltix-precision-v3`. This is a static demo:
all records are seeded in this browser, and nothing talks to a real BILTIX, Primavera P6, Autodesk APS,
Oracle, sensor or model service.

| Status | Meaning |
|---|---|
| **Complete** | Works end to end in this static app; behaviour is final for the agreed scope |
| **Partial** | Works, with a stated limit |
| **Demo** | Interface works over seeded or simulated data; real data needs a connection that is not built |
| **Not connected** | Needs a backend or a third-party connection that does not exist; the UI says so |
| **Broken** | Known not to work (none at the time of writing; see "Verification" below) |

Evidence column: **U** unit test in `tests/` · **Q** `tools/qa.mjs` browser smoke (routes × AR/EN × themes ×
widths) · **P** scripted interaction probe during development · **R** coordinator review. Probe and QA
artefacts are in the session scratchpad, not in the repository.

## Shell and settings

| Function | Status | Notes | Evidence |
|---|---|---|---|
| Arabic / English switch (app bar, Settings), persisted, `html[lang][dir]` | Complete | Survives reload; deep links keep the language | Q P |
| Numerals (Latin / Arabic-Indic) independent of language | Complete | Codes and IDs stay Latin | P U |
| Calendar (Gregorian / Hijri / both) | Complete | Drives the app-bar date | P |
| Times shown in Asia/Riyadh | Complete | Calendar days are formatted from their own date | U |
| Theme light / dark, density, motion (auto / reduce / full) | Complete | Respects `prefers-reduced-motion` | Q P |
| Background Static / Subtle / Cinematic | Complete | Data sits on opaque surfaces in every mode | Q R |
| Global Demo badge and status taxonomy | Complete | `js/core/status.js`; no "Connected" claim for simulated sources | U Q |
| Activity panel (collapsible) | Demo | Events are simulated and labelled so | P |
| Domain weights editor (sum 100 %, inline validation) | Complete | Changes the cockpit score; written to the audit log | P |
| Thresholds editor (critical ≥ alert + 5) | Complete | Effect preview on open risks | P |
| Data source set-up (JSON URL, Google Sheets, Supabase) with test | Partial | Real request from the browser; result recorded honestly; no server-side proxy, so CORS-blocked sources fail | P |
| Import JSON / CSV with per-row validation preview | Complete | Commits valid rows only; cancellable; offline and error states | P U |
| Backup export / validated restore / reset | Complete | This browser only | P |
| Webhook test (Notifications) | Partial | Real POST from the browser reports accepted / opaque / failed; forwarding of alerts needs a backend | P |
| Identity card (brand colours, logo) and sound toggle | Removed | Not in the v3 brief; nothing played sound | — |

## Risk cockpit and AI risk register

| Function | Status | Notes | Evidence |
|---|---|---|---|
| Cockpit A–F (heading, metrics, domain cards, analysis, priority actions, register) | Demo | All figures from `psel.*` over seeded data | Q P |
| Filters (domain, rating, status, owner, search) update every section | Complete | URL state via `replaceState`; bilingual search | P U |
| L × I matrix: cell opens matching records; inherent / residual toggle; keyboard | Complete | Roving tabindex; table view | P |
| Risk drawer: Overview / Evidence / Treatment / History | Complete | Severity, model confidence and input-data quality shown separately | P |
| Lifecycle actions (accept, override, dismiss, assign, residual, close, reopen) | Complete | Guards from `store.aiRiskTransitions` | P |
| Escalation | Not connected | "Simulated — not sent" | P |
| Evidence attachments | Partial | Stored on this device only, labelled | P |
| Register risk form (required L / I, no preselection, due not in past) | Complete | | P |
| Explainer hero at the top of the cockpit (AR / EN versions, poster first, muted autoplay after load + idle with the reduced-motion / Save-Data / minimised / already-watched exceptions, custom controls, seven-step progress rail, chapters + transcript, minimise remembered) | Complete | Today's files are silent ("Silent — captions in picture"); the AI-narrated files and `voice` in `js/data/explainer-media.js` come from the narration pipeline, and the UI then offers sound with an "AI-generated voice" disclosure. See Q2 on the Remotion licence | U P Q |
| Model confidence values | Demo | Labelled "Illustrative" | R |

## Tasks and alerts

| Function | Status | Notes | Evidence |
|---|---|---|---|
| Tasks board / list, create, edit, assign, guarded moves | Complete | Close needs an outcome; Overdue only after due | P |
| Write-back to BILTIX PM | Not connected | Labelled simulated, with retry | P |
| Alert queues, acknowledge, open risk | Demo | Alerts come from seeded / simulated events | P |
| Alert channels (e-mail, SMS, Teams) | Not connected | "Only the routing is recorded" | P |

## Domain modules

| Module | Status | Notes | Evidence |
|---|---|---|---|
| Contracts (flags, obligations, legal referral) | Demo | Duplicate-referral guard; tasks carry English fields | Q P |
| BOM / procurement | Demo | Procurement task creation | Q P |
| Schedule (Monte Carlo, weather) | Demo | Forecasts "Illustrative"; weather "Simulated", production source not connected | Q P |
| Cost (EVM, forecast) | Demo | No live Oracle | Q P |
| Roadmap (months 0–4, payment split entered by the user) | Partial | Durations "to be agreed"; payment percentages are user-entered, not invented | Q P |

## HSE pillar

| Module | Status | Notes | Evidence |
|---|---|---|---|
| HSE overview | Demo | Metrics from `sel.*` | Q P |
| Radar (sensors) | Demo | Simulated feed; a missing sensor shows "No sensor", never 0 | Q P U |
| HSE risk register and drawer | Complete | Over seeded data; residual ≤ inherent | Q P |
| Incidents (report, investigate, close guard) | Complete | Close refused while actions are pending; future dates rejected | Q P |
| Permits (kanban, gas test, expiring list) | Demo | Permit windows re-anchor to "now" | Q P |
| Inspections, training, compliance | Demo | Counts agree with the report | Q P |
| Reports (AR / EN, PDF, CSV, JSON) | Complete | One definition per metric; direction words follow the delta sign | U Q P |

## Platform

| Function | Status | Notes | Evidence |
|---|---|---|---|
| Integrations page (connector status, filters) | Not connected | Every enterprise connector shows Demo or Not connected; "Sync now" removed | Q P |
| Connector "Test connection" | Partial | Only for JSON / Sheets / Supabase / webhook; never turns a connector Live | P |
| Data quality (rules, quarantine) | Demo | Rule toggles and decisions written to the audit log in both languages | Q P |
| Engine (pipelines, stages, audit) | Demo | Precision, recall, calibration and drift show "Not measured" | Q P R |
| Retrain / pause model | Not connected | Disabled: "requires a connected model service" | P |

## Not built (out of scope or awaiting a decision)

- Multi-user storage, authentication, role-based access, server-side connectors and signed webhooks (Q4).
- Offline mode, QR workflows, CAD/BIM viewers, 360° capture (Q1).
- Production deployment (Q3).

## Verification

Filled in from the final verification run; see `acceptance.md`.
