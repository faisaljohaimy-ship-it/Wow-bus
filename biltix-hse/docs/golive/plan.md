# BILTIX Risk AI — Technical go-live plan

Version 4.0 · 2026-11-11 · Language: English (Arabic edition: `plan-ar.md`, same content)
Scope: what it takes to move BILTIX Risk AI from today's demo to a live pilot on one Saudi construction
project, starting with one end-to-end use case — **a delayed material approval and its effect on supply and the
schedule** — and then the four field priorities requested by BILTIX: **Offline, QR, site plans/drawings and 360°**.

## How to read this document

| Mark | Meaning |
|---|---|
| **[V]** | Must be verified with the vendor, telecom operator, authority or client before anyone commits to it. Product names are examples of a system *type*, not recommendations or endorsements. |
| **(est.)** | Planning estimate. Not a measurement, not a quote, not a benchmark. Every estimate shows its formula so it can be redone with real inputs. |
| **Demo** | Exists today in the static app over seeded or simulated data, and is labelled so in the UI. |
| **BX / CL / VN** | Owner: BILTIX / the client (contractor or owner organisation running the project) / a vendor or third party. |
| **P0…P6** | Phase (section 6): P0 Discovery · P1 Foundation (pilot site set-up) · P2 Integrations wave 1 · P3 Field release (Offline + QR + plans) · P4 360° capture and fixed cameras/edge · P5 AI validation · P6 Scale. |

No prices are given anywhere in this plan. Licences, hardware and telecom plans must be quoted by their vendors.

---

## 0. Executive summary

**Where we are.** BILTIX Risk AI is a static, build-free web application (23 routes, Arabic RTL by default and
English, light theme) published at https://biltix-risk-ai.vercel.app. It shows the full risk lifecycle — detect,
score, explain, recommend, accept or override, assign, treat, close — over **demo data held in the browser**. There is
no backend, no sign-in, no multi-user storage and no live connection to any external system. The UI says so through
an honest status taxonomy (Demo, Live, Offline, Stale, Error, Not connected). The site cameras on the plan view are
procedurally drawn and labelled "Simulated feed — no camera is connected".

**The use case to make real first.** The demo already contains a coherent chain on the project *Financial Gateway
Tower* (برج الواجهة المالية, demo project S1, Riyadh): the façade glass for curtain-wall item BQ-S1-08.01.040
(28,600 m², single-source supplier, 110-day lead time) is not yet approved, a client-requested glass specification
change (CO-034) is still pending, the latest date to place the purchase order passed 14 days ago, and the installation
activity A1100 — critical, zero float — is forecast 28 days late. The platform scores it, explains the drivers,
recommends actions and turns accepted actions into tracked tasks. All of these numbers are **demo data** (section 1.5).
Making this chain live needs four connections — document control/submittals, ERP procurement, Primavera P6 and the
BILTIX PM write-back — plus one piece of ground work that no software replaces: **linking each submittal to its BoQ
item, purchase-order line and schedule activity**.

**The four field priorities** (Offline, QR, plans, 360°) are not in the approved scope today (open question Q1 in the
v3 spec). This plan designs them so that they can be approved and phased: Offline and QR first (they make field data
trustworthy and fast), calibrated plans as the base layer that QR points, cameras and 360° captures sit on, then 360°
walk-throughs and fixed cameras with edge AI that send **events, not video**.

**Critical path.** The longest lead times are not engineering: client API access and sandbox accounts, the hosting
decision inside the Kingdom and its cybersecurity approval, privacy approvals for cameras, and hardware/telecom
delivery at site. Discovery (P0) exists to start all of them in week 1.

**Estimated timeline (est.).** Material-approval chain running in shadow mode on the pilot project around week 22;
field release (Offline + QR + plans) on the pilot site around week 26; camera pilot and the AI go/no-go decision around
week 34. Production go-live needs explicit authorisation from BILTIX (open question Q3).

### Capability table — today → needed to go live

| # | Capability | Today (Demo — verified in the repository) | Needed to go live | Owner | Phase |
|---|---|---|---|---|---|
| 1 | Risk cockpit, register, five domains, score = likelihood × impact × 4, risk drawer (Overview / Evidence / Treatment / History) | Built and working over seeded data in one browser; AR/EN | Same UI on a server API: multi-user data, per-project permissions, server-side metric definitions | BX | P1 |
| 2 | Material-approval chain (submittal → PO → delivery → installation) | Not an entity. Pieces exist: contract obligation CT2-O1 (mock-up and sample approval), BoQ order-by dates, change order CO-034, risks AIR-1003 / AIR-1005 / AIR-1027 | Submittal entity and register; links submittal ↔ BoQ item ↔ PO line ↔ P6 activity; the "latest approval date" rule; connectors (rows 3, 4, 2.1a) | BX + CL document control, procurement, planning | P2 |
| 3 | Schedule impact | Demo P6 figures (A1100 float 0, forecast +28 days, Monte Carlo labelled Illustrative) | P6 read (activities, float, baselines, period updates); deterministic impact rule; ML forecast only after P5 validation | BX + CL planning + P6 administrator | P2 / P5 |
| 4 | Procurement and suppliers | Demo suppliers, lead times, single-source flags, order-by dates | ERP read (POs, promised dates, receipts, suppliers); write-back limited to notes/flags if the client approves | BX + CL ERP owner | P2 |
| 5 | Recommendations with human in the loop | Accept / edit / override with a reason; recorded in this browser's audit log | Same flow server-side with real identities, role checks and an immutable audit log | BX | P1 |
| 6 | Treatment tasks and write-back to BILTIX PM | Task board with guarded transitions; write-back labelled "Simulated" | BILTIX PM API write-back with retries, reconciliation and failure alerts [V: API documentation, assumption AS2] | BX | P1–P2 |
| 7 | Closure with evidence | Attachments stored on this device only; a task cannot close without an outcome | Evidence store with write-once retention; links to source records (approved submittal, PO, goods receipt, P6 update); SHA-256 hashes; device and server timestamps; closure guard | BX | P1–P2 |
| 8 | Alerts and escalation | Routing recorded; channels "Not connected"; webhook test from the browser only | Notification service (e-mail, SMS, WhatsApp, Teams/Slack, Web Push) with delivery receipts and escalation timers | BX + CL IT | P2 |
| 9 | Identity, roles, multi-user | None (single-user demo, `localStorage`) | SSO with the client's identity provider (OIDC or SAML), MFA from the IdP, role-based access with project/site scope, SCIM provisioning | BX + CL IT | P1 |
| 10 | Hosting and data residency | Static demo on Vercel; no real data; residency not assessed | Production, backups, logs and DR inside the Kingdom on an approved provider [V] | BX + CL cybersecurity | P0–P1 |
| 11 | Offline field use | Offline state detected and shown; a web manifest exists; **no service worker, no queue** | PWA app shell, IndexedDB, outbox with idempotency keys, photo queue, sync status, managed devices | BX + CL IT | P3 |
| 12 | QR labels | None. The app's `Permissions-Policy` header currently disables the camera (`camera=()`) | Label registry, printing, five scan flows, offline lookup, revocation | BX + CL site team | P3 |
| 13 | Site plans / drawings | Illustrative SVG plan per site (zones, cranes, gates, simulated cameras), labelled "not a survey" | Drawing register from the DMS, calibrated sheets, layers, offline sheets, markups | BX + CL document control + surveyor | P3 |
| 14 | 360° walk-throughs | None | Capture kit and cadence, processing and pinning to plans, viewer, blurring, retention | BX + VN + CL site team | P4 |
| 15 | Fixed cameras and edge AI | 25 procedurally drawn simulated cameras; illustrative PPE boxes only for simulated events | Cameras, power, network, NVR/VMS, edge AI events, plan calibration, privacy notices, hardening | CL + VN integrator + BX | P4 |
| 16 | HSE feeds (permits, incidents, training, access control, wearables, weather) | Demo modules and 19 simulated HSE connectors | One connector per client system actually in use [V]; data-sharing approvals | BX + CL HSE | P2–P4 |
| 17 | AI models | Five pipelines shown; precision, recall, calibration and drift "Not measured"; confidence "Illustrative" | Rules first; ML trained on client history (≥ 24 months, assumption AS3); shadow mode; validation report; model cards | BX + CL data owners | P5 |
| 18 | Security and compliance | Static-site headers only; no backend to secure | NCA controls, PDPL, logging to SIEM, pen-test, backup and DR — as requirements to verify (section 5) | BX + CL cybersecurity / DPO | P1–P6 |

---

## 1. Target architecture

### 1.1 Principles

1. **Systems of record stay the source.** Submittals stay in document control, POs in the ERP, the schedule in P6,
   models in BIM. The platform reads them, links them, scores risk and writes back **only** flags, notes and tasks
   (proposal assumption AS6). It never edits a source record.
2. **Evidence is immutable.** Every closure links to source records and stored files with hashes and timestamps.
3. **People decide.** The platform recommends; a named person accepts, edits or overrides, with a reason, and that
   decision is audited (already the demo's flow).
4. **Rules before models.** Date arithmetic (order-by, latest approval, float) is deterministic and explainable from
   day one. Machine-learning forecasts are added only after they beat the rules on the client's own history (section 4).
5. **Honest status carries over.** The Demo / Live / Offline / Stale / Error / Not connected taxonomy stays; a
   connector becomes "Live" only on real evidence.
6. **Field first, offline by design.** The site app works without a network and never claims "synced" before the
   server has acknowledged.
7. **Video stays at the edge.** Cameras send structured events and blurred snapshots, not continuous video.
8. **Data stays in the Kingdom.** Production data, backups, logs and keys are hosted inside Saudi Arabia [V].

### 1.2 Component view

```
 FIELD & OFFICE                    BILTIX RISK AI  (production hosted in KSA)               CLIENT & SITE SYSTEMS
 +----------------+  HTTPS/TLS  +----------------------------------------------+  API/VPN  +----------------------+
 | PWA web app    |<----------->| API gateway | AuthN: OIDC/SAML <-> client IdP |<--------->| Document control /   |
 | AR/EN, offline |             | AuthZ: roles + project/site scope | quotas   |           | submittals (DMS)     |
 | outbox, QR,    |             +----------------------------------------------+           | ERP (POs, receipts)  |
 | plans, 360     |             | Domain services: risks, tasks, materials,    |           | Primavera P6         |
 +----------------+             | submittals, plans, labels, evidence          |           | BIM (APS / IFC)      |
                                | Integration hub: connectors, webhooks, DLQ   |           | BILTIX PM modules    |
 +----------------+             | Event bus (internal) | MQTT broker (devices) |           | HSE systems          |
 | Notifications  |<------------| Risk scoring: rules + models + explanations  |           +----------------------+
 | e-mail, SMS,   |             | Workflow | audit log (append-only, chained)  |  MQTT/TLS +----------------------+
 | WhatsApp, Teams|             | PostgreSQL + PostGIS | object store (WORM)   |<----------| SITE EDGE            |
 +----------------+             | Analytics store | model registry | logs/SIEM |  events   | NVR/VMS, edge AI box |
                                +----------------------------------------------+  only     | IoT gateway, sensors |
                                                                                           +----------------------+
```

### 1.3 Components

| Component | Responsibility | Technology options (examples, decided in P0) | Notes |
|---|---|---|---|
| PWA client | Today's app, evolved: reads the API, works offline, scans QR, shows plans and 360° | Keep plain ES modules; add a hand-written service worker and an IndexedDB layer | The no-build rule can stay; a service worker is a plain JS file |
| API and domain services | Risks, tasks, materials/submittals, plans, labels, evidence, audit | REST/JSON with an OpenAPI contract; TypeScript or Python services | Server-side copies of today's single metric definitions (`psel`, `sel`) |
| Authentication | Federation with the client's IdP | OIDC (preferred) or SAML 2.0; MFA enforced by the IdP; SCIM 2.0 provisioning | Service accounts for connectors use client-credentials or certificates, never personal accounts |
| Authorisation | Who sees and does what | Roles × scope (portfolio, project, site, zone); row-level security in the database | Roles: executive, project manager, planner, procurement, document controller, site engineer, HSE officer, legal, finance, subcontractor (restricted), viewer, administrator |
| Integration hub | Connectors, schedules, webhook receivers, mapping to the canonical model, retries, dead-letter queue | Connector workers in the platform, or the client's existing integration platform (e.g., Oracle Integration, SAP Integration Suite, MuleSoft) [V] | Idempotent upserts; per-source watermark; signature check on every inbound webhook |
| Event bus | Domain events between services; device and edge events | A log-based bus (Kafka-compatible or NATS) internally; an MQTT 3.1.1/5 broker for devices on TLS port 8883 | Ordered per key (e.g., per submittal); schema registry; store-and-forward on the edge |
| Data | Operational data, geometry, files, analytics | PostgreSQL with PostGIS; S3-compatible object store with object lock (write-once) for evidence; a separate analytics store for model training | Plan geometry in calibrated project coordinates |
| Validation and quality layer | Schema checks, de-duplication, completeness, consistency, quarantine | Same rules the demo shows on the Data quality page, run server-side | Nothing reaches scoring before it passes (proposal SC2) |
| Risk scoring | Rules, models, explanations, thresholds | Rules engine + model service + model registry | Score keeps decision D5: likelihood × impact × 4 (0–100); model confidence and input-data quality stay separate fields |
| Workflow and tasks | Lifecycle state machine, write-back to BILTIX PM | Server-side version of `store.aiRiskTransitions` and task guards | Write-back with retries and a reconciliation report |
| Notifications | E-mail, SMS, WhatsApp, Teams/Slack, Web Push; escalation timers | Provider per channel [V] | Delivery receipts stored; quiet hours; no personal data in message previews |
| Video and edge layer | Site NVR/VMS, edge AI, events to the platform, on-demand clips | ONVIF/RTSP on site; WebRTC or LL-HLS gateway for viewing [V] | Section 3d |
| Observability | Logs, metrics, traces, security events | OpenTelemetry; forwarding to the client's SIEM [V] | Section 5 |
| Delivery | Environments dev / test / UAT / production; infrastructure as code; CI/CD | All production-like environments in the Kingdom | Test data is synthetic or masked |

### 1.4 Data model additions for the material-approval chain

| Entity | Key fields | Source of truth |
|---|---|---|
| Submittal (طلب اعتماد مادة) | number, revision, title, specification section, discipline, BoQ item, supplier/manufacturer, submitted / due / returned dates, review code (A approved, B approved as noted, C revise and resubmit, D rejected — the client's own codes [V]), reviewer, linked documents | Document control / DMS |
| Sample / mock-up | type, location, inspection date, result, photos | DMS or BILTIX site reports |
| Purchase order and line | PO number, line, item, quantity, supplier, promised date, status | ERP |
| Delivery and goods receipt | ASN/delivery note, quantity received, condition, GRN number, photos | ERP + field app (QR) |
| Activity | P6 activity code, WBS, early/late dates, total float, baseline, data date | Primavera P6 |
| Chain link | submittal ↔ BoQ item ↔ PO line ↔ activity, with who confirmed the link and when | Platform (human-confirmed) |
| Evidence | kind, source system, source ID, file hash (SHA-256), device time, server time, uploader | Platform evidence store |
| Audit event | actor, action, object, before/after, reason, time, previous-event hash | Platform (append-only) |

**Ground truth that software cannot invent:** in most projects these four identifiers are not linked in any system.
Discovery produces the mapping for the pilot's long-lead items; afterwards the platform *suggests* links (same
specification section, same supplier, text similarity) and a document controller or planner *confirms* them.

### 1.5 The worked example, end to end (Demo data)

All values below come from the app's seed data (`js/data/platform-seed.js`) and are **demo data**. Dates are relative
to the demo's anchor day `d` (the app re-anchors them to "today").

| Fact | Demo value | Seed reference |
|---|---|---|
| Project | Financial Gateway Tower (برج الواجهة المالية), Riyadh | `projects` S1 |
| Subcontract | CT-2026-021, curtain-wall glazing, Gulf Façades Company (شركة الخليج للواجهات), SAR 212 M | `contracts` CT2 |
| Obligation | Deliver the façade visual mock-up and obtain sample approval — due in 26 days (clause 5.4) | CT2-O1 |
| Item | Unitized curtain wall units 1.5 × 4.2 m — BoQ 28,600 m², BIM 27,950 m² | `boqItems` BQ2 (BQ-S1-08.01.040) |
| Supplier | Single source, financial health 58/100, lead time 110 days | `suppliers` SUP4 |
| Need date / order-by date | need d+96; order-by = 96 − 110 = d−14 → **passed 14 days ago**, no PO issued | BQ2 |
| Pending change | CO-034: triple-glazed insulated units, SAR 14.2 M, pending for 16 days | `changeOrders` CO3 |
| Activity | A1100 curtain-wall installation start, floors 8–15; critical, total float 0; baseline finish d+142, forecast d+170 (**+28 days**), delay probability 0.71 | `scheduleTasks` T3 |
| Subcontractor progress | 14 % actual vs 22 % planned; scorecard 58/100 | `subcontractors` SC1 |
| Related permit | Partial road-closure licence for lifting façade units (Riyadh Region Municipality): submitted 26 days ago, statutory 30 days, in process | `approvals` AP1 |
| Cost line | Façade budget SAR 212 M, forecast SAR 226 M (+6.6 % = (226 − 212) ÷ 212) | `costLines` CL2 |
| Risks and scores | AIR-1005 single source + order date passed: L5 × I4 × 4 = **80, red**; AIR-1003 A1100 slip: L4 × I5 × 4 = **80, red**; AIR-1027 CO-034 pending: L4 × I3 × 4 = **48, yellow** | `aiRisks` AR5, AR3, AR27 |
| Recommendations | Issue the glazing PO within 5 days and qualify a second supplier for 30 % of the quantity (AIR-1005, owner: procurement manager, due d+5); approve the glass supplier within 7 days with conditional sample approval and split installation into two parallel packages, floors 8–11 and 12–15, recovering about 18 of the 28 days (AIR-1003, owner: planning manager, due d+10); ask the Engineer for a written instruction under §13.1 within 5 days (AIR-1027) | same |
| Model confidence | 0.86 (AIR-1005), 0.84 (AIR-1003) — shown as **Illustrative** | same |

**The rule the live system runs** (deterministic, explainable):

```
Need date            N  = planned start of the installing activity (P6) − site buffer B   (B = receipt, inspection, staging; agreed per trade)
Latest PO date       O  = N − L                     L = supplier lead time (ERP / supplier acknowledgement)
Latest approval date A  = O − P                     P = PO processing time after approval (client's procurement norm)
Slack                S  = A − expected approval date  (or A − actual approval date once approved)
Delay at need date   D  = max(0, −S)
Delay to activity    Δ  = max(0, D − TF)            TF = total float of the installing activity (P6)
```

Demo check: N = d+96 (the demo uses B = 0), L = 110 → O = d−14. With TF = 0 every further day of delay moves A1100.
The demo's +28-day forecast is a model output labelled Illustrative; the rule alone gives a floor, not a forecast.

**Closure with evidence (target flow — not built).** The risk can be closed when the following are linked and a
second person has checked them (four-eyes): (1) the submittal returned with code A or B in the DMS (number, revision,
date); (2) the PO in the ERP with the supplier's promised date ≤ N − B; (3) a P6 update showing A1100 back on its
baseline or an approved recovery; (4) a residual assessment (likelihood, impact, justification) by the risk owner;
for deliveries also (5) the goods receipt plus the QR scan with photos at the gate. Every item carries its source ID,
file hash and timestamps; the audit log records who closed it and why.

### 1.6 Hosting and data residency

| Requirement | What to verify [V] |
|---|---|
| Production data, backups, logs, monitoring data and encryption keys stored and processed inside the Kingdom (proposal assumption AS4) | The provider's in-Kingdom region(s) and that every service used (database, object store, KMS, logging, AI services) is available *in that region*; DR in a second in-Kingdom location |
| Provider eligibility | Registration/classification of the cloud provider under the CST Cloud Computing Regulatory Framework for the client's data classification; the client's own approved-provider list |
| Data classification | Classification of project data under the NDMO / national data management standards, and whether the client is a government entity or critical infrastructure operator (stricter hosting classes may apply) |
| Sub-processors | Every SaaS in the chain (360° processing, e-mail, SMS, WhatsApp, error monitoring, any large-language-model API) — where it stores and processes data; anything outside the Kingdom is excluded from personal and confidential data or replaced |
| Current demo hosting | The Vercel deployment is a public demo with no real data. Do not load client data into it. |

Provider candidates are of three kinds: hyperscaler regions inside the Kingdom, Saudi cloud providers, and the
client's own data centre or private cloud. Which regions and services are generally available changes over time;
P0 confirms the current list with each provider in writing [V].

---

## 2. Integrations (الربط)

**Legend.** Direction: **In** = the platform reads; **Out** = the platform writes back. Effort per connector,
engineering only, excluding the wait for client access (est.): **S** ≈ 1–2 weeks, **M** ≈ 3–5 weeks, **L** ≈ 6–10
weeks. Every connector ships with contract tests, a reconciliation report (record counts and key dates match the
source), a runbook and a security review.

### 2.1 The material-approval chain (wave 1 — build first)

#### a) Document control and submittals (اعتماد المواد)

| Field | Value |
|---|---|
| Purpose | Submittal status, review codes and dates; sample and mock-up approvals; the approved documents used as closure evidence |
| System types | Oracle Aconex, Procore, Autodesk Construction Cloud (ACC), BILTIX DMS, or the client's own DMS (often SharePoint-based) — whichever the pilot project actually uses |
| Protocol / API family | Aconex: Aconex web APIs for documents, mail/transmittals and workflows [V: which API generation, and whether submittal reviews are run as workflows]. Procore: REST API with OAuth 2.0, Submittals endpoints, webhooks. ACC: Autodesk Platform Services — ACC Submittals API, Data Management API, Webhooks [V: read/write coverage]. SharePoint: Microsoft Graph (sites, lists, drive items) with an app registration limited by `Sites.Selected`. BILTIX DMS: BILTIX REST v1 + webhooks [V: documentation] |
| Direction | In. Optional Out: a comment or link on the submittal only if the client asks |
| Frequency | Webhooks where offered; otherwise polling every 15–60 minutes (est.); nightly full reconciliation |
| Key entities | Submittal number, revision, title, specification section, BoQ reference, supplier/manufacturer, status, review code, submitted/due/returned dates, reviewer, attachments (datasheets, test reports, sample photos) |
| Auth | OAuth 2.0 app or service account created by the client's system administrator; least privilege on the pilot project only |
| Client prerequisites | Administrator to register the integration [V: vendor approval process for API access]; sandbox or a read-only view of the live project; a list of the project's submittal codes and status values; 3 months of submittal log export for mapping; sign-off by document control as data owner |
| Effort | M per system type (L if submittals are free-text transmittals with no structured status) |
| Risks | API access needs vendor or partner approval and takes weeks [V]; status vocabularies differ per project; submittal ↔ BoQ links missing (section 1.4); regional hosting of the DMS itself [V] |

#### b) ERP procurement (POs, suppliers, deliveries)

| Field | Value |
|---|---|
| Purpose | PO existence and dates, supplier promised dates, deliveries and goods receipts, supplier master data; procurement side of the chain |
| System types | Oracle Fusion Cloud ERP (the demo's catalogue), SAP S/4HANA (the demo lists it as an alternative), or another ERP the client runs |
| Protocol / API family | Oracle Fusion: REST resources for purchase orders, suppliers and receipts; BI Cloud Connector for bulk extracts; business events through Oracle Integration [V]. SAP S/4HANA: OData APIs for purchase orders, business partners/suppliers and material documents (goods receipts); events via SAP Integration Suite / Event Mesh [V]. Others: OData/REST or scheduled flat-file extracts as a fallback |
| Direction | In. Out (optional, proposal catalogue): a supplier risk flag or a note on the PO — only with written approval of the ERP owner |
| Frequency | Every 1–4 hours for POs and receipts (est.); daily for supplier master data |
| Key entities | Purchase requisition, PO header/lines, item, quantity, supplier, promised and need-by dates, status, ASN/shipment, goods receipt (GRN), invoice status (read-only), change orders |
| Auth | Integration user with a read-only role scoped to the pilot's business unit/project; OAuth or certificate-based where supported |
| Client prerequisites | Integration user and role; test/sandbox instance with representative data; list of PO statuses and project codes; network path (allow-list or private connectivity) [V]; sign-off by the ERP owner and procurement |
| Effort | M (L if a custom extract must be built by the client's ERP partner) |
| Risks | ERP change windows and partner availability; project/WBS coding differs between ERP and P6; licence implications of integration users [V] |

#### c) Schedule — Primavera P6

| Field | Value |
|---|---|
| Purpose | Activities, dates, total float, critical path, baselines and period updates; the schedule side of the chain |
| System types | Primavera P6 EPPM (the demo's catalogue); Oracle Primavera Cloud; Microsoft Project as a fallback |
| Protocol / API family | P6 EPPM Web Services (SOAP); the P6 EPPM REST API on versions that include it [V: client's P6 version]; XER/XML export as the lowest-common-denominator fallback. Primavera Cloud: REST API [V]. MS Project: XML export or Project Online OData [V] |
| Direction | In. Out (optional, proposal catalogue): a risk activity code or user-defined field and a notebook entry on affected activities — only with the planning manager's approval |
| Frequency | Daily read; full read after each schedule update (weekly or bi-weekly data date) |
| Key entities | Project, WBS, activity ID and codes, relationships, early/late dates, total float, baseline dates, data date, resources, user-defined fields |
| Auth | P6 application user with read access to the pilot project (write only to the agreed code/field) |
| Client prerequisites | P6 version and deployment (on-premises or cloud) [V]; integration user; VPN or private connectivity to on-premises P6; the pilot schedule's activity coding conventions; approval of any write-back by the planning manager |
| Effort | M (S if XER exports are accepted for the pilot) |
| Risks | On-premises P6 behind the client firewall; schedule quality (open ends, constraints) distorts float; write-back resisted by planners — keep it optional |

#### d) BIM — Autodesk Platform Services (APS) or IFC

| Field | Value |
|---|---|
| Purpose | Quantities (BoQ ↔ BIM variance, already shown in the demo), element locations for QR labels and plans, 3D context in the browser |
| Protocol / API family | APS Data Management API (hubs, projects, versions), Model Derivative API (translation, object tree, properties), Viewer SDK; AEC Data Model API (GraphQL) where the client's models qualify [V]; IFC files as the vendor-neutral alternative |
| Direction | In |
| Frequency | On each published model version (APS webhooks) or nightly |
| Key entities | Model version, element external ID (Revit UniqueId) and IFC GlobalId, category/type, level, room/zone, quantities |
| Auth | OAuth 2.0 app; the client's ACC/BIM 360 account administrator authorises the app for the pilot project |
| Client prerequisites | Account admin approval; model naming and parameter standards (levels, zones, classification); a federated or discipline model for the façade |
| Effort | M |
| Risks | The viewer's numeric `dbId` is not stable between model versions — link labels and markups to the external ID or IFC GlobalId; model quality decides usefulness; 3D streaming needs a network (plan 2D for offline) |

#### e) BILTIX PM write-back

BILTIX REST v1 + webhooks (proposal assumption AS2: documented and stable, changes notified 30 days ahead) [V].
Out: tasks, risk flags and scores on BILTIX records; In: task status changes. Effort M. Today the write-back is
labelled "Simulated" everywhere in the app.

### 2.2 Other connectors in the demo catalogue (`platform-seed.js`)

| Connector (demo id) | Purpose | Protocol / API family | Dir. | Frequency | Effort | Prerequisites and risks |
|---|---|---|---|---|---|---|
| BILTIX — Contracts (`biltix-contracts`) | Contracts, clauses, obligations (e.g., CT2-O1) | BILTIX REST v1 + webhooks [V] | In/Out | Webhook + nightly | M | API documentation; Out = clause flags and redlines as suggestions only |
| BILTIX — BoQ/BoM (`biltix-boq`) | BoQ items, specifications, suppliers | BILTIX REST v1 [V] | In/Out | Hourly | S–M | Item codes must match ERP and P6 coding |
| BILTIX — Schedule (`biltix-schedule`) | BILTIX schedule synced with P6 | BILTIX REST v1 [V] | In/Out | Daily | S | Avoid two schedule truths: P6 stays master |
| BILTIX — Site reports (`biltix-site-reports`) | Daily reports, observations, inspections, attendance | BILTIX REST v1 + webhooks [V] | In/Out | Webhook | M | Personal data in reports (PDPL, section 5) |
| BILTIX — Cost (`biltix-cost`) | Cost lines, change orders, payment certificates | BILTIX REST v1 [V] | In/Out | Daily | S–M | Reconcile with ERP actuals |
| BILTIX — Images and media (`biltix-images`) | Site photos, video, surveys | S3-compatible media API [V] | In | Event-driven | M | Image size and volume; blurring before AI use |
| Oracle CX Sales (`oracle-crm`) | Clients, opportunities, bids for new-contract risk | REST [V] | In | Daily | S | Low priority for the pilot |
| SAP S/4HANA (`sap-s4`) | Alternative ERP (projects, materials, finance) | OData [V] | In/Out | Hourly | M–L | See 2.1b |
| Zoho CRM / HubSpot (`zoho-crm`, `hubspot`) | Alternative CRMs | REST with OAuth 2.0 / private app token [V] | In | Daily | S | Only if the client uses them |
| Commodity prices (`feed-commodities`) | Steel, cement, copper, aluminium, diesel price trends | Licensed data provider API [V] | In | Daily | S | Licence terms for redistribution in dashboards [V] |
| FX rates (`feed-fx-sama`) | Official exchange rates | Publication by the Saudi Central Bank (SAMA) [V: machine-readable API or file] | In | Daily | S | If no API, use a licensed FX feed |
| Weather (`feed-weather-ncm`) | 7-day forecasts, dust and wind warnings per site | National Center for Meteorology services [V: availability and terms] or a commercial weather API | In | Every 1–6 hours | S | Point forecasts per site coordinates; heat index for HSE |
| GIS layers (`feed-gis`) | Site boundaries, utilities, heritage, geology | OGC WMS/WFS from the national geospatial authority or the municipality [V] | In | Weekly | S–M | Access agreements; coordinate system |

### 2.3 HSE and site systems (in the demo catalogue, plus the missing ones)

| System | Purpose | Protocol / API family | Dir. | Frequency | Effort | Prerequisites and risks [V] |
|---|---|---|---|---|---|---|
| **Permit-to-work** (missing as a connector) | Live permits by zone (hot work, height, confined space, lifting, isolation), gas-test times, expiry | API of the client's PTW system, or BILTIX permits if PTW runs in BILTIX; CSV as fallback | In | Near real time (≤ 5 min est.) | M | Many sites run paper permits: then the QR permit flow (3b) is the capture method |
| **Incidents and near misses** (missing) | Incidents, near misses, investigations, actions | API of the client's HSE system or BILTIX site reports | In | Webhook / hourly | M | Health data is sensitive (PDPL) |
| **Training and competency** (missing; HRMS in demo) | Certificates and expiry per worker; operator competency (cranes, rigging, scaffolding) | HRMS/LMS API or file extract [V] | In | Daily | M | Worker identifiers and consent/notice; no public API assumed for third-party certifiers |
| Access control and attendance (`access-control`) | Head-count per zone, muster lists, unauthorised entry | Turnstile/controller vendor API or event export [V] | In | Near real time | M | Personal data; integrate counts per zone where possible, not identities |
| Wearables and gas detectors (`wearables`) | Gas alarms, man-down, lone worker, heat stress | Vendor cloud API or docking-station export; MQTT for gateways [V] | In | Real time (alarms) | M–L | Radio type approval by CST [V]; data minimisation |
| IoT gateway (`iot-gateway`) | Environmental and structural sensors | MQTT over TLS with per-device certificates | In | Real time | M | Device provisioning and certificate rotation |
| Smart cameras (`cctv-ai`) | PPE and exclusion-zone events | Edge events over MQTT/HTTPS (section 3d) | In | Real time | L | Section 3d |
| Weather (`weather-ncm`) | As 2.2, plus heat stress for work-rest planning (seasonal midday outdoor work restriction set by the Ministry of Human Resources [V: current dates]) | As 2.2 | In | Hourly | S | — |
| GOSI work injuries (`gosi`) | Occupational injury reporting status | No public API assumed [V]; manual reference | In (manual) | — | S | Keep as a manual link |
| HRMS (`hrms`) | Workforce, trades, subcontractor staff | HRMS API or extract [V] | In | Daily | M | Data minimisation |
| E-mail | Alerts, digests | SMTP relay or Microsoft Graph `sendMail` | Out | Event | S | Sender domain authentication (SPF/DKIM/DMARC) |
| SMS | Critical alerts | Licensed Saudi SMS provider; sender name registration [V] | Out | Event | S | No personal or confidential data in texts |
| WhatsApp Business | Alerts, acknowledgements | WhatsApp Business Platform (Cloud API) with pre-approved templates [V] | Out/In | Event | S–M | Template approval; opt-in; hosting location of the provider [V] |
| Microsoft Teams / Slack | Channel alerts | Teams Workflows webhooks (classic Office 365 connectors are being retired by Microsoft [V]); Slack apps / incoming webhooks | Out | Event | S | Tenant admin approval |
| Web Push | Field app nudges (pending sync, new task) | Web Push (VAPID); on iOS only for web apps added to the Home Screen [V] | Out | Event | S | Users must opt in |
| Webhooks / n8n / Zapier (`webhooks`) | Client automations | Signed outbound webhooks (HMAC-SHA256, timestamp, replay window) | Out | Event | S | Hosted automation tools may be outside the Kingdom [V] |
| Google Sheets, Supabase (`google-sheets`, `supabase`) | Demo-time data sources only | — | — | — | — | Not for production data |
| Power BI (`powerbi`) | Client reporting | Read from the analytics store through a gateway, or push datasets via the Power BI REST API [V] | Out | Daily | S–M | Tenant region and sharing settings [V] |

### 2.4 What the client must provide (all connectors)

| Item | Detail |
|---|---|
| Accounts | Sandbox/test tenant and an integration (service) account per system, least privilege, pilot project only |
| API keys / app registrations | OAuth apps or keys created by the client's administrators; secrets handed over through a vault, never by e-mail |
| Network | Allow-listing of the platform's egress IPs, VPN or private connectivity for on-premises systems (P6, ERP) [V] |
| Data samples | 3 months of each source for mapping; ≥ 24 months of history for AI (assumption AS3) |
| Licences | Any API, integration-user or module licences the vendors require [V — no quotes in this plan] |
| Sign-offs | Data owner per source (document control, procurement, planning, HSE), cybersecurity, DPO; written approval for every write-back |
| People | A named contact per system with ≥ 20 % availability during P0 and acceptance (assumption AS5) |

---

## 3. Roadmap priorities requested by BILTIX

Each priority: what exists today, the target, technical design, what is needed on the ground, phases and acceptance
criteria. All four are **not built** and **not yet in the approved scope** (Q1).

### 3a. Offline (العمل دون اتصال)

**Today.** The app is static and loads its demo data locally; the shell detects `navigator.onLine` and shows the
Offline status; a web manifest (`assets/manifest.webmanifest`) exists with an SVG icon only. There is **no service
worker, no IndexedDB layer, no outbox and no server** to sync with. The JS/CSS/font shell measures about 5.3 MB
uncompressed in the repository (js 4.5 MB, css 0.4 MB, fonts 0.4 MB); videos are separate and are not cached offline.

**Target.** A site engineer can open the app with no network, see the assigned project's risks, tasks, materials and
drawings "as of" the last sync, capture observations, checklists, delivery receipts and photos, and have everything
reach the server exactly once when the network returns — with the time it happened and the time it arrived.

**Technical design.**

| Part | Design |
|---|---|
| App shell | Service worker with a versioned cache for HTML/JS/CSS/fonts (cache-first, updated in the background; the existing `tools/stamp-build.mjs` stamp becomes the cache version). API reads: network-first with an IndexedDB fallback and an "as of" time |
| Local data | IndexedDB stores per entity (risks, tasks, materials/submittal status, labels, drawings metadata) for the projects the user is assigned to; size-bounded |
| Outbox | Every write is a queued command `{ commandId (UUID), type, payload, entityRef, userId, deviceId, deviceTime, seq, appVersion, payloadHash }`. `commandId` is the idempotency key: the server stores it with a unique constraint and returns the original result for a repeat |
| Sync triggers | Background Sync where supported (Chromium) [V]; everywhere else, including iOS Safari: on app start, on `online`, on `visibilitychange` to visible, on pull-to-refresh, and a timer while open. Web Push can remind users that items are waiting [V] |
| Photos and attachments | Resized on the device (long edge 2048 px, JPEG/WebP quality ≈ 0.8 → about 0.3–0.6 MB per photo, est.), SHA-256 computed on the device, stored as Blobs in IndexedDB, uploaded with resumable chunked uploads (pre-signed multipart or the tus protocol); the server re-hashes and rejects mismatches |
| Storage quota | `navigator.storage.persist()` requested; `navigator.storage.estimate()` checked with a warning at 80 %. On iOS, Safari can clear site storage after 7 days without use for sites **not** added to the Home Screen [V] — field users install the app to the Home Screen |
| Security at rest | Managed devices (MDM: passcode, OS version, encryption, remote wipe, managed browser) are the primary control. App layer: an AES-GCM key generated with WebCrypto as non-extractable, used to encrypt queued payloads; sign-out and remote revocation wipe local stores. Tokens: short-lived access token, refresh token lifetime agreed with cybersecurity (e.g., 7–14 days, est.), bound to the device |
| Audit integrity | Each record keeps device time (with offset), server receive time and a per-device sequence. Clock skew = server time − device time at the sync handshake; records with \|skew\| above a threshold (e.g., 5 minutes, est.) are flagged. Server time is the legal time; both are shown. The server appends audit events to a hash-chained log |
| Sync status UX | One status pill in both languages: "Online · synced", "Offline · 3 waiting", "Syncing 2 of 5", "Needs attention" (conflict or failure). Per-record chips: waiting / sent / conflict. "Synced" only after the server acknowledges. Reuses the existing Offline / Stale / Error statuses |

**Conflict policy per entity.**

| Entity | Allowed offline | Policy |
|---|---|---|
| Observation / near-miss report | Create, add photos | Append-only; no conflict; the server numbers it; duplicates removed by `commandId` |
| Photo / attachment | Create | Content-addressed by SHA-256; identical files collapse |
| Inspection checklist answer | Create, edit own draft | Per-field last-writer-wins by field timestamp until submitted; submission locks it |
| Task status | Transition | Server state machine decides; if the task changed meanwhile, the transition is re-validated; an illegal one becomes a visible conflict, never a silent overwrite |
| Task comment | Create | Append-only |
| Delivery receipt (QR) | Create | First accepted receipt wins; a second one becomes "possible duplicate — review" |
| Submittal / material status | Read only | Source systems decide; shown with "as of" time |
| Risk record | Read only; propose a change | Proposals queued and reviewed online |
| Permit check | Read; record a check | Append; validity re-checked on the server; "expired while offline" flagged |
| Drawing markup | Create, edit own | Last-writer-wins per markup, bound to a drawing revision; if the revision changed, flagged "check against the new revision" |

**Storage budget per device (est.).** Shell ≈ 5–10 MB + project data ≈ 5–20 MB + drawings 40 sheets × ≈ 3 MB vector
PDF = 120 MB + photo queue 200 × 0.5 MB = 100 MB → **≈ 250 MB**. Upload time per photo = size × 8 ÷ uplink:
0.5 MB × 8 ÷ 1 Mbps = 4 s (est.).

**On the ground.** Managed phones or tablets (the client's MDM [V]); rugged cases and power banks; a list of
no-coverage areas (basements, cores, upper floors); the client's cybersecurity approval for offline data on devices;
a 30-minute training per user.

**Phases.** P3a (weeks 13–18): shell caching, read-only offline, sync pill. P3b (weeks 17–22): outbox, photo queue,
conflict handling. P3c (weeks 21–26): MDM roll-out and pilot on site.

**Acceptance criteria.**
- AC-OFF-1 With the network off, the installed app opens and shows the assigned project with an "as of" time.
- AC-OFF-2 An observation with 3 photos created offline survives closing the app and restarting the device; after
  reconnection it exists exactly once on the server with matching SHA-256 hashes.
- AC-OFF-3 Double taps and retries after a timeout create one record (idempotency test).
- AC-OFF-4 An offline task transition that became illegal shows a conflict and overwrites nothing.
- AC-OFF-5 The sync pill shows correct counts in Arabic and English and never says "synced" before the server acknowledges.
- AC-OFF-6 72 hours offline with 200 queued photos stays within the storage budget; a warning appears at 80 % quota.
- AC-OFF-7 The audit view shows device and server time; skew above the threshold is flagged.
- AC-OFF-8 Passes on an installed PWA on iOS and on Android Chrome, both under MDM.

### 3b. QR (رموز QR)

**Today.** No QR feature. The production header `Permissions-Policy: camera=(), microphone=(), geolocation=()` in
`vercel.json` disables the camera, so in-app scanning is impossible until it becomes `camera=(self)` (and
`geolocation=(self)` if photos are geotagged).

**Target.** Durable QR labels on zones, equipment, materials/deliveries, permits and inspection points. Scanning one
opens the right record and the right action, online or offline.

**What a QR encodes.** An HTTPS URL on a BILTIX domain with an **opaque, random ID** and no personal or project data,
for example `https://q.<biltix-domain>/L/7KQ9X2M4TZ8R…` (ID ≥ 96 bits of randomness, base32). The ID is looked up in the
label registry (cached on the device for offline use). Why a URL: any phone camera opens it and the installed app
can capture it; why opaque: a label reveals nothing if photographed. An optional short signature lets the app reject
foreign codes offline, but **a signature does not stop someone copying a real label onto the wrong item** — binding
the label to an entity and a location at installation (photo + plan position) and reconciling scans does. The app
only opens QR URLs on the allowed domain (protection against QR phishing). Size (est.): a ≈ 40–60 character URL fits a
version 4–6 QR at error-correction level Q (ISO/IEC 18004); a 50 mm code of version 6 (41 modules) gives
50 ÷ 41 ≈ 1.2 mm per module; reading distance is roughly 10 × code width (rule of thumb [V] with the chosen scanner).

| Label type | Placed on | Opens | Lifecycle |
|---|---|---|---|
| Zone | Plate at each zone entry (e.g., S1-Z2) | Zone page: open risks, permits, inspections; "report an observation here" | Long-lived; replaced when damaged |
| Equipment | Cranes, hoists, MEWPs, lifting gear | Certificates and inspection validity, pre-use checklist | Asset lifetime on site |
| Material / delivery | Delivery note, pallet, crate or stillage | Submittal status and review code, PO, expected quantity, linked risks (e.g., AIR-1005) | Delivery to installation |
| Permit | Permit board copy | Validity, gas-test time, closure | Permit duration; revoked at closure or expiry |
| Inspection point | ITP hold points, scaffold tags, fire points | Checklist for that point | Until the point is closed |

**Scan flows.**

1. **Report an observation** — scan a zone QR → location pre-filled → photo(s), category, severity → outbox.
2. **Check a material's approval and delivery status** — scan a delivery or crate QR → "Submittal approved, code B — install
   per comments" or "Approval pending — do not install" plus the PO and risk links. This is the field end of the
   material-approval chain in section 1.5.
3. **Open a checklist** — scan an inspection-point QR → the right checklist with the last result.
4. **Confirm delivery receipt with photo evidence** — scan at the gate → quantity, condition, photos, name → a receipt
   record with hashes; the ERP goods receipt remains the system of record (the platform links both).
5. **Equipment pre-use check** — scan the crane or MEWP → certificate validity and the pre-use checklist.

**Offline.** The registry for the user's projects (IDs, type, entity, plan position, status, revocation list) is
cached; all five flows queue in the outbox (3a). Status shown offline carries the "as of" time.

**Printing and durability.** Outdoor labels face direct sun, heat and dust; sun-exposed metal can exceed 70 °C (est.).
Use UV-stable materials — for example photo-anodised aluminium or polyester with UV-resistant over-laminate — with
adhesive rated for high temperatures, plus mechanical fixing (rivets, cable ties) on steel [V with the label
supplier; test on the pilot site for 4–8 weeks]. Delivery labels are short-lived thermal-transfer prints. Each label
shows a short human-readable code below the QR for manual entry.

**Lifecycle and revocation.** requested → generated (batch PDF) → printed → **installed** (scan + photo + plan
position) → active → damaged/replaced → revoked/retired. The registry is the truth; revocations sync to devices; a
revoked label shows "revoked" offline after the next sync.

**Linking to BIM and plans.** Registry fields: `planSheetId`, `x, y` in calibrated plan coordinates, `level`, and,
where relevant, the BIM element's external ID / IFC GlobalId (never the viewer's `dbId`).

**On the ground.** A label printer or label supplier [V]; a person responsible for installing and replacing labels;
an installation walk per zone; photos at installation; the gate team trained for delivery scans.

**Phases.** P3a: registry and printing; P3b: flows 1–3 and 5; P3c: flow 4 at the gate and the pilot.

**Acceptance criteria.** Scan-to-result ≤ 2 s online and ≤ 1 s offline from the cached registry (est. targets);
no personal data in any payload (automated test); unknown-domain QR codes are refused with a warning; revoked labels
show as revoked offline; label legibility after the 4–8-week site exposure test; every delivery scan has photos and
hashes.

### 3c. Site plans and drawings (المخططات)

**Today.** The Site view (`#/spatial`) draws an engineering-style SVG plan per site from seed data — zones, building
footprints with levels, cranes with slewing radius, gates, roads, sensors and 25 simulated cameras with view cones —
labelled "Illustrative layout, not a survey". Coordinates are site-normalised (0..1), not surveyed.

**Target.** The real, current drawings are the base layer: zones, cranes, cameras, QR points, permits and 360°
captures sit on calibrated sheets that match the site.

| Part | Design |
|---|---|
| Drawing register | Synced from the DMS: sheet number, title, discipline, revision, status (e.g., issued for construction), issue date, DMS document ID. Only the current approved revision is used as base; superseded revisions are flagged, never silently replaced |
| Calibration | Two control points give scale + rotation (similarity transform); three or more give an affine fit with residuals shown. Control points come from grid intersections or the surveyor's coordinates in the project coordinate system (national geodetic frame or a project local grid — confirmed with the surveyor [V]). Target residual ≤ 0.25 m (est.) |
| Layers | Zones (polygons), cranes and slewing radii, exclusion zones, cameras and fields of view, QR points, sensors, permits, laydown areas, logistics routes, 360° capture points |
| Mobile and offline | Cache the original vector PDF and render it on the device (PDF.js, Apache-2.0) with a low-resolution preview; raster tiling only where PDFs are too heavy. Arithmetic: an A0 sheet at 300 dpi is 14,040 × 9,930 px ≈ 139 MP ≈ 2,830 tiles of 256 px including the pyramid (139 MP ÷ 65,536 × 1.33) — at ≈ 40 KB per tile ≈ 113 MB per sheet (est.), which is why vector PDFs are preferred |
| Markups | Vector annotations in plan coordinates, bound to a sheet revision; carried forward to a new revision with a "verify against Rev X" flag |
| BIM link | 2D sheets offline; 3D (APS viewer) online only; links by external ID / IFC GlobalId |

**On the ground.** Document control exports the register; the surveyor provides control points; the site team
draws zone boundaries once per phase with the HSE manager; plans updated on each relevant revision.

**Phases.** P3a register and calibration tool; P3b layers and offline sheets; P3c markups and pilot.

**Acceptance criteria.** Calibration residual ≤ 0.25 m on check points; the latest approved revision appears within
one sync of its DMS issue; superseded sheets flagged; 40 sheets available offline within the storage budget;
markups survive a revision change with the right flag.

### 3d. 360°

#### (i) 360° walk-through capture (جولات 360°)

| Topic | Design |
|---|---|
| Capture | Consumer 360° cameras on a helmet mount or monopod; video mode for speed, interval photos for quality [V: camera model and its bitrate/resolution] |
| Registration to plans | Either a 360° capture service that maps walks to sheets automatically (examples of such services: OpenSpace, HoloBuilder, Cupix, DroneDeploy — [V] including where they host data) or in-platform pinning: the user marks start/end and turns on the calibrated sheet, frames are interpolated, and corrected by hand |
| Cadence | Weekly per active floor and at milestones (before close-in of walls/ceilings); daily for the façade during installation (est.) |
| Storage (formula) | Raw video per walk (GB) = bitrate (Mbps) × minutes × 60 ÷ 8 ÷ 1,000. Example (est.): 100 Mbps × 10 min = 7.5 GB. Processed frames = route length ÷ spacing × frame size: 600 m ÷ 1.5 m = 400 frames × 4 MB = 1.6 GB. Ten floors weekly ≈ 75 GB raw, ≈ 8–16 GB processed per week (est.) |
| Upload | Time = size × 8 ÷ uplink: 75 GB × 8 ÷ 20 Mbps ≈ 8.3 hours (est.) → extract frames on the site laptop and upload overnight; keep raw video on site for a short retention |
| Processing | Stitching (if needed), frame extraction, multi-resolution tiling, face and number-plate blurring **before** anything is viewable |
| Privacy | Workers are visible: privacy notice, blurring, role-based access, retention agreed with the DPO; no face recognition |

#### (ii) Fixed 360° / PTZ IP cameras (كاميرات ثابتة)

| Topic | Requirement / design |
|---|---|
| Placement | From the calibrated plan: crane lifting zones, façade lifting route and the road-closure area (AP1), laydown areas, gates, edges of open slabs; panoramic or 360° fisheye for overview, PTZ for detail; mount height and field of view checked on the plan (the demo already models heading, field of view and mount height per camera) |
| Desert environment | Ambient heat of 50 °C and more, plus solar load: cameras rated for the site's maximum ambient temperature [V per model], sunshields, light-coloured housings; sealed, fanless housings against dust (IP66/IP67 = dust-tight; IK10 = 20 J impact resistance); lens cleaning schedule after dust events; avoid aiming into the low sun |
| Power | PoE from a site switch: 802.3af up to 15.4 W at the switch (12.95 W at the camera), 802.3at 30 W (25.5 W), 802.3bt 60–90 W (51–71.3 W) for PTZ with IR. Copper runs ≤ 100 m; fibre with media converters beyond. Remote poles: solar + battery (below) |
| Solar pole sizing (est.) | Daily energy E = Σ P × 24 h: camera 10 W + LTE router 8 W = 18 W → 432 Wh/day. Battery = E × days of autonomy ÷ depth of discharge ÷ heat derating = 432 × 2 ÷ 0.8 ÷ 0.8 ≈ 1,350 Wh. PV = E ÷ (peak sun hours × system efficiency) = 432 ÷ (6 × 0.7) ≈ 103 W → choose ≥ 200 W for dust and ageing margin. Peak sun hours per site [V]. An edge AI box on the pole (≈ 15–25 W [V]) would double E → put edge AI in the site office |
| Network | Fibre or point-to-point wireless to the site office; 4G/5G routers where needed (private APN from the operator [V]); cameras on their own VLAN with no internet access; the edge box and NVR pull streams; only outbound mTLS (MQTT 8883 / HTTPS 443) from the site to the platform through an IPsec or WireGuard VPN; NTP time sync (evidence timestamps) |
| Protocols | ONVIF Profile S (streaming), T (H.265 and advanced streaming), G (edge storage), M (analytics metadata and events) [V conformance per model]; RTSP/RTP; H.265 for recording, H.264 sub-stream for browsers (H.265 playback in browsers is limited [V]) via a WebRTC or LL-HLS gateway |
| VMS vs direct | Recommended: the client's or integrator's VMS/NVR on site records and manages cameras; the platform integrates with the VMS (events, on-demand clips, live view links) rather than pulling every camera directly. Direct ONVIF only for a small pilot without a VMS |
| Edge AI | An edge box (GPU-class embedded computer or camera-embedded analytics apps [V]) runs detection on site and sends **events, not video**: PPE missing (hard hat, vest, harness), person in an exclusion zone, person under a suspended load. Event = `{eventId, cameraId, zoneId, type, deviceTime, serverTime, confidence, bbox, planX, planY, modelVersion, snapshotUrl (blurred), snapshotHash}` over MQTT QoS 1 with store-and-forward |
| Crane load zones | Dynamic zone around the hook: hook position = crane base + R(cos θ, sin θ) from crane telemetry (slew angle θ, trolley radius R) from the crane's anti-collision or data-logger system [V: vendor interface], or vision-only as a fallback |
| Calibration to plan / BIM | Homography H (3 × 3, 8 degrees of freedom) per fixed view or PTZ preset, from ≥ 4 ground control points — use 6–10 spread across the view, solved robustly (RANSAC); report the RMS reprojection error in metres (target ≤ 0.5 m at 30 m range, est.). The foot point of a detection is mapped to plan coordinates and tested against zone polygons. Fisheye/360° lenses are calibrated and de-warped first. Valid for the ground plane only |
| Bandwidth and storage (formula) | Storage per camera per day (GB) = bitrate (Mbps) × 86,400 ÷ 8 ÷ 1,000. Example (est.): 4 MP H.265 at 15 fps ≈ 3 Mbps → 32.4 GB/day → 30-day retention ≈ 0.97 TB; 12 cameras ≈ 11.7 TB, × 1.25 for redundancy ≈ 14.6 TB on the site NVR. Streaming all 12 to the cloud = 36 Mbps continuous ≈ 11.7 TB per month (36 × 2,592,000 ÷ 8 MB) — not realistic over LTE. Events instead: E events/day × 0.15 MB snapshot + a 10 s clip (3.75 MB) for a share f: 300 × 0.15 + 300 × 0.2 × 3.75 = 270 MB/day ≈ 8.1 GB/month (est.) |
| Retention | Continuous video on the site NVR (e.g., 30 days, est. — and not less than any statutory minimum [V]); event metadata for the project duration; snapshots e.g., 90 days (est.); all agreed with the DPO |
| Privacy (PDPL) | DPIA before installation; Arabic and English notices plus the main languages of the workforce at entrances and camera areas; blurring of faces and plates at the edge; no face recognition; unblurred footage only on the site NVR with role, reason and audit for access; compliance with the Law on the Use of Security Surveillance Cameras and its implementing regulations [V: applicability, prohibited locations, retention, licensed installers]; HCIS directives if the site falls under them [V] |
| Hardening | Unique credentials, no defaults; firmware update plan; disable UPnP and vendor P2P cloud features; camera VLAN with 802.1X where supported; NVR not exposed to the internet; logs to the SIEM; physical tamper protection and anti-theft mounting for poles; CST type approval for radio equipment and SASO conformity for imports [V] |

#### (iii) What the platform's 360° viewer needs

Multi-resolution tiled panoramas (equirectangular or cube faces) with an open-source viewer — for example Photo Sphere
Viewer (MIT), Pannellum (MIT) or Marzipano (Apache-2.0) [V licence per version]; a mini-map showing position and heading
on the calibrated sheet; hotspots for QR points, risks, observations and tasks; a date slider and side-by-side compare
of two captures; deep links (`#/spatial?...&capture=…`); live-camera tiles from the VMS gateway; keyboard access and
AR/EN labels; blurred content only; watermarked downloads; "Simulated" or "Demo" status wherever data is not live.

**On the ground (3d overall).** Site survey with the integrator; power and network design; camera locations approved
by the site manager and HSE; privacy notices installed; a person to run weekly 360° walks; cleaning and maintenance
schedule; spare parts.

**Phases.** P4a 360° capture (weeks 17–26); P4b fixed cameras and edge (weeks 19–34, including hardware lead time [V],
installation, calibration and a 4-week trial).

**Acceptance criteria.** Four consecutive weekly walks of the pilot floors pinned to the sheets, with ≤ 2 minutes of
manual correction per walk (est.); blurring verified on a random sample; camera uptime ≥ 98 % per camera per month in
the trial (est. target); edge events reach the platform within 10 s at p95 (est.); homography RMS ≤ 0.5 m; no
continuous video leaves the site; enclosure temperatures logged within the rated range through the trial; the DPO's
written sign-off before go-live.

---

## 4. AI readiness

**Principle.** Today the app shows five pipelines with metrics "Not measured" and confidence "Illustrative". That
stays true until each model is validated on the client's data. Version 1 is **rules and statistics**; machine
learning is added only where it beats them in shadow mode.

| Pipeline | v1 (rules / statistics) | ML candidate after validation | Data needed | Labels | Metrics |
|---|---|---|---|---|---|
| Materials / procurement | Latest approval date, order-by date, single-source and supplier-health flags (section 1.5) | Probability that a submittal is resubmitted or approved late, by discipline, supplier and reviewer | ≥ 24 months of submittal logs with outcomes, PO and receipt history (AS3) | Approved late? days late; resubmission count | Precision and recall at the alert threshold; warning lead time (days before the order-by date); Brier score |
| Schedule | Float erosion, late predecessors, Monte Carlo with distributions fitted to the client's history | Activity duration overrun from period updates | Schedule updates per data date, baselines | Actual vs planned durations | Mean absolute error of forecast finish; P80 coverage (should contain the actual ≈ 80 % of the time) |
| Contracts | Clause library and keyword rules, human legal review always | Clause classification on the client's contract library | Labelled clauses from legal | Flag type per clause | Precision and recall per flag; review time saved |
| Cost | Earned-value rules (CPI, SPI, EAC, VAC — already in the demo) | EAC forecast | Monthly cost history | Final cost | Mean absolute percentage error of EAC |
| Site vision | None (rules on events) | PPE, exclusion-zone and load-zone detection | Thousands of labelled frames from the client's own cameras — day, night/IR, dust, heat haze (est.) | Bounding boxes per class | Precision and recall per class; false alerts per camera-hour |

**Labelling and data.** Written labelling guidelines; a double-labelled sample with agreement measured (Cohen's κ;
target ≥ 0.7, est.); splits by project and time (no leakage between training and test); versioned datasets.

**Governance.** Model cards (purpose, data, metrics, limits, owner); an approval step before any model leaves
shadow mode; thresholds agreed with the risk owners; drift monitoring on inputs (population stability index, alert
at > 0.2, est.) and on outcomes; rollback to rules at any time; human-in-the-loop on every decision (accept, edit,
override with reason — the reasons become training labels). No automated decision about individual workers;
subcontractor and supplier scores always come with their drivers and a way to contest them. Reference: the SDAIA AI
Ethics Principles [V current version]. Any large-language-model use (e.g., drafting explanations) must run in the
Kingdom or receive no confidential or personal data [V].

**Explainability.** Each score shows its drivers with their contribution, the rule text or model features, and links
to the source records (as the demo's drawer does today); model confidence and input-data quality stay separate.

**Go/no-go (end of P5).** At least 12 weeks of shadow mode on live pilot data (est.); metrics meet the targets agreed
in P0; planners and procurement confirm usefulness on a reviewed sample. Otherwise the pipeline stays rules-only.

---

## 5. Security and compliance requirements (to verify)

These are requirements to confirm with the client's cybersecurity function and DPO. Applicability and versions are
[V].

| Area | Requirement | Reference to verify |
|---|---|---|
| Governance | Security policy, roles, risk assessment, asset inventory for the platform and site devices | NCA Essential Cybersecurity Controls (ECC) |
| Cloud | Provider eligibility, tenant isolation, key management, in-Kingdom hosting | NCA Cloud Cybersecurity Controls (CCC); CST Cloud Computing Regulatory Framework |
| Data | Classification, encryption, data handling, retention and disposal | NCA Data Cybersecurity Controls (DCC); NDMO data management and personal data protection standards |
| Site OT / IoT / cameras | Network segmentation, device hardening, remote access control | NCA Operational Technology Cybersecurity Controls (OTCC), where applicable |
| Personal data | Lawful basis, privacy notices, records of processing, DPIA for cameras/wearables/location, data-subject rights, retention, cross-border transfer rules, breach notification to the authority (72 hours [V]), DPO where required | Personal Data Protection Law (PDPL) and its implementing regulations (SDAIA) |
| Surveillance | Camera locations, notices, retention, installer licensing | Law on the Use of Security Surveillance Cameras and its implementing regulations |
| Identity | SSO, MFA, least privilege, joiner–mover–leaver via SCIM, quarterly access reviews | ECC |
| Application | Secure SDLC, code review, dependency and secret scanning, SAST/DAST, OWASP ASVS-based checks | ECC |
| Encryption | TLS 1.2+ (1.3 preferred) in transit; AES-256 at rest with in-Kingdom KMS; customer-managed keys as an option | ECC / CCC |
| Logging | Central logs and security events to the client's SIEM; immutable audit log; time sync | ECC |
| Testing | Independent penetration test before go-live and yearly, plus after major changes; no open high/critical findings at go-live | ECC |
| Backup and DR | Daily backups plus point-in-time recovery for the database; object-store versioning; DR site in the Kingdom; RPO/RTO agreed (e.g., RPO ≤ 1 h, RTO ≤ 8 h — est., to be agreed); restore tested every quarter | ECC / CCC |
| Third parties | Data-processing agreements; sub-processor list and locations; security clauses | ECC; PDPL |
| Devices | MDM for field devices; remote wipe; OS currency | ECC |

---

## 6. Roadmap timeline, RACI and client checklist

**Relation to the proposal.** The proposal's milestones M0–M4 fix only the *start month* (0–4) of each stage of the
core risk platform; durations and payment shares are "to be agreed". This plan adds the field priorities (Q1) and
realistic client-access lead times. All durations below are **estimates** (est.).

| Phase | Weeks (est.) | Deliverables | Exit criteria |
|---|---|---|---|
| P0 Discovery and design | 1–6 | Process map of the material-approval chain on the pilot project; system inventory with API access confirmed; identifier mapping for the top long-lead items; hosting decision; security architecture; DPIA started; camera site survey; data samples analysed; backlog with acceptance criteria | Q1–Q4 answered in writing; sandbox access to DMS, ERP and P6 granted; hosting approved by cybersecurity; pilot project and site named |
| P1 Foundation (pilot site set-up) | 5–14 | In-Kingdom environments; SSO and roles; database; audit log; evidence store; API; today's UI reading the API; CI/CD; logs to SIEM; BILTIX PM write-back | Foundation pen-test with no open high/critical findings; pilot users sign in with SSO; test data in place of demo data |
| P2 Integrations wave 1 | 9–22 | Connectors: submittals/DMS, ERP procurement, P6 (read, optional write-back), BIM quantities; mapping tool; latest-approval-date rule in shadow mode; notifications | Reconciliation clean for 2 consecutive weeks; planners confirm the chain's dates for the pilot's long-lead items |
| P3 Field release (Offline + QR + plans) | 13–26 | PWA offline, outbox, photo queue; QR registry, printing and five flows; drawing register, calibration, offline sheets, markups; MDM roll-out | AC-OFF and QR/plan acceptance criteria pass; pilot site uses QR for deliveries and observations for 4 weeks |
| P4a 360° capture | 17–26 | Capture kit, cadence, processing, pinning, viewer, blurring | Four consecutive weekly walks pinned and viewable |
| P4b Fixed cameras and edge | 19–34 | Survey, design, procurement [V lead time], installation, network, NVR/VMS, edge events, homography, notices | Trial targets met for 4 weeks; DPO sign-off |
| P5 AI validation | 20–34 | Shadow mode, labelled outcomes, validation report, model cards, thresholds | Go/no-go per pipeline (section 4) |
| P6 Scale | 35 onward | Onboarding playbook; further projects (≈ 4–6 weeks each, est.) | Per-project checklist complete |

```
Week                 0   0    1    1    2    2    3    3    4
                     1   5    0    5    0    5    0    5    0
P0 Discovery         ######   .    .    .    .    .    .    .
P1 Foundation            ##########.    .    .    .    .    .
P2 Integrations w1       .   ##############  .    .    .    .
P3 Field release         .    .  ##############   .    .    .
P4a 360 capture          .    .    . ##########   .    .    .
P4b Cameras + edge       .    .    .   ################.    .
P5 AI validation         .    .    .    ###############.    .
P6 Scale                 .    .    .    .    .    .    ######>
Milestones                1       2       3   4       5 6
```

Milestones (est.): **MS1** week 6 scope and access confirmed · **MS2** week 14 foundation live in the Kingdom (test) ·
**MS3** week 22 material-approval chain in shadow mode on the pilot · **MS4** week 26 field release on the pilot site ·
**MS5** week 34 camera trial complete and AI go/no-go · **MS6** week 36 production go-live decision for the pilot
(requires BILTIX authorisation, Q3).

### RACI

R = responsible, A = accountable, C = consulted, I = informed. BX = BILTIX; CL-PMO = client project/PMO; CL-IT =
client IT and cybersecurity; CL-DC = document control; CL-PR = procurement; CL-PL = planning; CL-HSE = HSE; CL-LG =
legal and DPO; VN = vendors (DMS/ERP/P6 administrators or partners, camera integrator, telecom, hosting, 360° service).

| Activity | BX | CL-PMO | CL-IT | CL-DC | CL-PR | CL-PL | CL-HSE | CL-LG | VN |
|---|---|---|---|---|---|---|---|---|---|
| Scope, acceptance criteria, pilot choice | R | A | C | C | C | C | C | C | I |
| Hosting in the Kingdom and security architecture | R | I | A | — | — | — | — | C | C |
| SSO / IdP federation | R | I | A | — | — | — | — | — | C |
| Submittals / DMS connector | R | I | C | A | — | — | — | — | C |
| ERP procurement connector | R | I | C | — | A | — | — | — | R |
| P6 connector and write-back approval | R | I | C | — | — | A | — | — | C |
| Identifier mapping (submittal ↔ BoQ ↔ PO ↔ activity) | C | A | — | R | R | R | — | — | — |
| Drawing register and calibration | R | A | — | R | — | C | C | — | C |
| QR labels: printing and installation | C | A | — | — | C | — | R | — | R |
| Field devices and MDM | C | I | A/R | — | — | — | C | — | — |
| Cameras: design, supply, installation | C | A | C | — | — | — | C | C | R |
| Site network and telecom | C | I | A | — | — | — | — | — | R |
| Privacy: DPIA, notices, signage | C | I | C | — | — | — | C | A/R | — |
| AI validation and go/no-go | R | A | — | C | C | C | C | C | — |
| UAT and training | R | A | C | R | R | R | R | — | — |
| Penetration test and go-live approval | R | C | A | — | — | — | — | C | R |

### Client checklist (قائمة متطلبات العميل)

**Governance**
- [ ] Product owner named; representatives from procurement, legal, planning, finance, HSE, document control at ≥ 20 % (AS5)
- [ ] Pilot project and site named; written answers to Q1–Q4
- [ ] Data owners named per source system

**Access and accounts**
- [ ] Sandbox or test access: DMS/submittals, ERP, P6, BIM account, BILTIX modules
- [ ] Integration accounts and app registrations created by the client's administrators
- [ ] IdP federation details (OIDC/SAML), groups for roles, SCIM endpoint

**Data**
- [ ] Submittal log, PO list, P6 schedule export, BoQ for the pilot (3 months)
- [ ] History ≥ 24 months for AI (AS3), or written acceptance that v1 is rules-only
- [ ] Status vocabularies and codes (submittal review codes, PO statuses, activity codes)

**Network and site**
- [ ] Allow-lists / VPN / private connectivity for on-premises systems
- [ ] Site connectivity map (fibre, LTE/5G coverage, dead zones)
- [ ] Power points and mounting permissions for cameras; site office space for NVR/edge

**Devices**
- [ ] MDM platform and enrolment of pilot phones/tablets; iOS/Android versions
- [ ] Label supplier or printer; label installation owner

**Privacy and legal**
- [ ] DPIA for cameras, wearables and location data; notices approved; signage installed
- [ ] Retention schedule agreed (video, snapshots, events, photos, documents)
- [ ] Data-processing agreement; list of sub-processors approved

**Security**
- [ ] Hosting provider approved; data classification confirmed
- [ ] SIEM integration point; incident contacts
- [ ] Pen-test window and scope agreed

---

## 7. Risks, mitigations and open questions

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Client API access and vendor approvals take months | High | High | Start in week 1; accept file exports (XER, CSV) as a bridge for the pilot | CL-IT / BX |
| R2 | Submittal ↔ BoQ ↔ PO ↔ activity links do not exist | High | High | Map the top long-lead items in P0; suggestion + confirmation tool; make linking part of the submittal procedure | CL-PMO |
| R3 | Status vocabularies differ between projects | Medium | Medium | Mapping table per project; validation layer quarantines unknown values | BX |
| R4 | No suitable in-Kingdom service for a needed component (e.g., 360° processing, LLM) | Medium | High | Choose in-Kingdom alternatives or self-host; exclude personal/confidential data otherwise | BX / CL-IT |
| R5 | Write-back to P6/ERP refused | Medium | Low | Keep write-back optional; deliver value through the platform and BILTIX PM | BX |
| R6 | Poor site connectivity | High | Medium | Offline-first design; events not video; overnight uploads | BX / VN |
| R7 | Heat and dust damage devices; theft or vandalism of poles | Medium | Medium | Rated hardware, sunshields, cleaning schedule, anti-theft mounts, spares, monitoring of device health | VN / CL site |
| R8 | iOS PWA limits (no Background Sync, storage eviction if not installed) | High | Medium | Home Screen install via MDM, foreground sync, push reminders; native wrapper only if the pilot proves it necessary | BX |
| R9 | Privacy concerns or non-compliance with camera rules | Medium | High | DPIA first, blurring at the edge, no face recognition, notices in workers' languages, DPO sign-off | CL-LG |
| R10 | AI false alarms erode trust | Medium | High | Rules first, shadow mode, thresholds agreed with owners, every alert explained, easy override with reason | BX |
| R11 | Labels fade, peel or are copied onto the wrong item | Medium | Medium | Outdoor-rated materials, 4–8-week exposure test, installation binding with photo and plan position, scan reconciliation | CL site |
| R12 | Scope creep from the four field priorities | High | Medium | Phase gates and written scope per phase (Q1) | CL-PMO / BX |
| R13 | Dependence on a few client experts (planner, document controller) | Medium | Medium | Named back-ups; recorded walkthroughs; runbooks | CL-PMO |
| R14 | Vendor licences or plan changes needed for API use | Medium | Medium | Ask vendors in P0 [V]; budget decision by the client | CL-IT |
| R15 | Demo and live data confused in demos or the film | Low | High | Keep the status taxonomy; label every demo number and AI image; separate demo and production domains | BX |
| R16 | Explainer licence (Remotion company licence for organisations above three employees) | Medium | Low | Confirm licensing before commercial use (Q2) | BX |

**Open questions**

- Q1 Are Offline, QR, plans/drawings (CAD/BIM) and 360° in the approved scope, and in which phase? (from the v3 spec)
- Q2 Remotion company licence for the explainer. (v3 spec)
- Q3 Authorisation to deploy to production, and who signs it. (v3 spec)
- Q4 Backend and hosting choice inside the Kingdom. (v3 spec)
- Q5 Which document-control system runs submittals on the pilot project, and what review codes does it use?
- Q6 Which ERP and which P6 version/deployment (cloud or on-premises) does the pilot use?
- Q7 Will the client allow any write-back to P6 or the ERP, and to which fields?
- Q8 Is there an existing VMS/NVR and camera integrator on the pilot site?
- Q9 Which MDM do field devices use, and are they company-owned?
- Q10 Is the pilot site subject to stricter regimes (government data classification, critical infrastructure, HCIS)?
- Q11 Retention periods for video, snapshots, photos and documents (DPO decision).
- Q12 Who owns label installation and replacement on site?
- Q13 Is a 360° capture service acceptable if its data is hosted outside the Kingdom, or must processing be in-Kingdom/self-hosted?
- Q14 Accuracy targets the risk owners require before AI outputs are shown as decision support.

---

## Appendix A — Glossary (English ↔ Arabic)

| English | العربية |
|---|---|
| Material approval / submittal | اعتماد المواد / طلب اعتماد مادة |
| Review code A / B / C / D | معتمد / معتمد مع ملاحظات / يُعدَّل ويُعاد تقديمه / مرفوض |
| Shop drawings | مخططات الورشة |
| Visual mock-up | النموذج الأولي |
| Purchase order (PO) | أمر الشراء |
| Lead time | مدة التوريد |
| Need date / order-by date | تاريخ الاحتياج / آخر موعد لأمر الشراء |
| Latest approval date | آخر موعد للاعتماد |
| Goods receipt (GRN) | إشعار استلام البضاعة |
| Critical path / total float | المسار الحرج / الطفو الكلي |
| Baseline | خط الأساس |
| Assessment / recommendation | التقييم / التوصية |
| Treatment (mitigation) | المعالجة |
| Residual risk | المخاطر المتبقية |
| Closure with evidence | الإغلاق بالدليل |
| Human in the loop | الإنسان في الحلقة |
| Audit log | سجل التدقيق |
| Offline / sync / outbox | العمل دون اتصال / المزامنة / قائمة الإرسال |
| QR label | ملصق رمز QR |
| Drawing register / revision | سجل المخططات / المراجعة (الإصدار) |
| Calibration (of a plan) | معايرة المخطط |
| 360° walk-through | جولة تصوير 360° |
| Fixed camera / PTZ | كاميرا ثابتة / كاميرا متحركة PTZ |
| Edge AI | الذكاء الاصطناعي على الحافة (في الموقع) |
| Exclusion zone | منطقة محظورة |
| Face blurring | طمس الوجوه |
| Data residency | إقامة البيانات داخل المملكة |
| Shadow mode | التشغيل الظلي (دون التأثير على القرار) |
