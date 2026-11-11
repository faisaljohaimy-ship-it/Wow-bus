/**
 * BILTIX Risk AI — go-live readiness data (js/data/golive.js). Owner: #/golive (PLT-04).
 *
 * The structure of docs/golive/plan.md (v4) as data: the capability matrix (executive table, 18 rows), the
 * connector catalogue (plan §2, the material-approval chain first), the phases and milestones (§6, estimates),
 * the four field priorities (§3: Offline, QR, plans/drawings, 360°), the on-the-ground needs and the client
 * checklist (§6). Every user-visible word lives in js/i18n/golive.js (namespace 'golive'), keyed by the ids here.
 *
 * Pure: no DOM, no i18n, no store. The helpers at the end are covered by tests/golive.test.mjs.
 */

/** Go-live classes, in display order. */
export const GL_STATUSES = Object.freeze(['built_demo', 'ready_connect', 'needs_client', 'planned']);

/**
 * Capability matrix (plan §0 table, rows 1–18). `status` is the go-live class:
 *   built_demo    exists and works in this demo over seeded data;
 *   ready_connect the demo screen exists and the connection is designed; it needs credentials and a backend;
 *   needs_client  blocked first on client input (access, mapping, IdP, hosting, history, approvals);
 *   planned       not built (roadmap; not in the approved scope yet — open question Q1).
 * `route` is the closest existing view (deep link), or null.
 */
export const CAPABILITIES = Object.freeze([
  { id: 'c1', status: 'built_demo', owner: 'BX', phase: 'P1', route: 'cockpit' },
  { id: 'c2', status: 'needs_client', owner: 'BX + CL', phase: 'P2', route: 'bom' },
  { id: 'c3', status: 'ready_connect', owner: 'BX + CL', phase: 'P2 / P5', route: 'schedule' },
  { id: 'c4', status: 'ready_connect', owner: 'BX + CL', phase: 'P2', route: 'bom' },
  { id: 'c5', status: 'built_demo', owner: 'BX', phase: 'P1', route: 'airisks' },
  { id: 'c6', status: 'built_demo', owner: 'BX', phase: 'P1–P2', route: 'tasks' },
  { id: 'c7', status: 'planned', owner: 'BX', phase: 'P1–P2', route: 'tasks' },
  { id: 'c8', status: 'ready_connect', owner: 'BX + CL', phase: 'P2', route: 'alerts' },
  { id: 'c9', status: 'needs_client', owner: 'BX + CL', phase: 'P1', route: null },
  { id: 'c10', status: 'needs_client', owner: 'BX + CL', phase: 'P0–P1', route: null },
  { id: 'c11', status: 'planned', owner: 'BX + CL', phase: 'P3', route: null },
  { id: 'c12', status: 'planned', owner: 'BX + CL', phase: 'P3', route: null },
  { id: 'c13', status: 'planned', owner: 'BX + CL', phase: 'P3', route: 'spatial' },
  { id: 'c14', status: 'planned', owner: 'BX + VN + CL', phase: 'P4', route: null },
  { id: 'c15', status: 'planned', owner: 'CL + VN + BX', phase: 'P4', route: 'spatial' },
  { id: 'c16', status: 'ready_connect', owner: 'BX + CL', phase: 'P2–P4', route: 'integrations' },
  { id: 'c17', status: 'needs_client', owner: 'BX + CL', phase: 'P5', route: 'engine' },
  { id: 'c18', status: 'needs_client', owner: 'BX + CL', phase: 'P1–P6', route: null },
].map((c) => Object.freeze(c)));

/**
 * Connector catalogue (plan §2). `wave` 1 = the material-approval chain (§2.1, in chain order), 2 = other demo
 * connectors (§2.2), 3 = HSE, site and notification systems (§2.3). `recIds` are the demo records the entry
 * describes (state.integrations ids and state.platform.connectors ids); `missing` = no record in this demo.
 * `dir`: in | out | inout | manual | none. `effort` (est.): S ≈ 1–2 weeks, M ≈ 3–5, L ≈ 6–10 (engineering only).
 * `cls` overrides the go-live class derived by connectorClass().
 */
export const CONNECTORS = Object.freeze([
  { key: 'dms', wave: 1, chain: 1, dir: 'in', effort: 'M', recIds: ['biltix-dms'] },
  { key: 'erp', wave: 1, chain: 2, dir: 'in', effort: 'M', recIds: ['oracle-erp', 'erp-sap', 'sap-s4'] },
  { key: 'p6', wave: 1, chain: 3, dir: 'in', effort: 'M', recIds: ['primavera-p6'] },
  { key: 'bim', wave: 1, chain: 4, dir: 'in', effort: 'M', recIds: ['autodesk-aps'] },
  { key: 'pm', wave: 1, chain: 5, dir: 'inout', effort: 'M', recIds: ['biltix-pm'] },
  { key: 'contracts', wave: 2, dir: 'inout', effort: 'M', recIds: ['biltix-contracts'] },
  { key: 'boq', wave: 2, dir: 'inout', effort: 'S–M', recIds: ['biltix-boq'] },
  { key: 'schedule', wave: 2, dir: 'inout', effort: 'S', recIds: ['biltix-schedule'] },
  { key: 'sitereports', wave: 2, dir: 'inout', effort: 'M', recIds: ['biltix-site-reports'] },
  { key: 'cost', wave: 2, dir: 'inout', effort: 'S–M', recIds: ['biltix-cost'] },
  { key: 'images', wave: 2, dir: 'in', effort: 'M', recIds: ['biltix-images'] },
  { key: 'crm', wave: 2, dir: 'in', effort: 'S', recIds: ['oracle-crm', 'zoho-crm', 'hubspot'] },
  { key: 'commodities', wave: 2, dir: 'in', effort: 'S', recIds: ['feed-commodities'] },
  { key: 'fx', wave: 2, dir: 'in', effort: 'S', recIds: ['feed-fx-sama'] },
  { key: 'weather', wave: 2, dir: 'in', effort: 'S', recIds: ['feed-weather-ncm', 'weather-ncm'] },
  { key: 'gis', wave: 2, dir: 'in', effort: 'S–M', recIds: ['feed-gis'] },
  { key: 'ptw', wave: 3, dir: 'in', effort: 'M', recIds: [], missing: true },
  { key: 'incidents', wave: 3, dir: 'in', effort: 'M', recIds: [], missing: true },
  { key: 'training', wave: 3, dir: 'in', effort: 'M', recIds: [], missing: true },
  { key: 'access', wave: 3, dir: 'in', effort: 'M', recIds: ['access-control'] },
  { key: 'wearables', wave: 3, dir: 'in', effort: 'M–L', recIds: ['wearables'] },
  { key: 'iot', wave: 3, dir: 'in', effort: 'M', recIds: ['iot-gateway'] },
  { key: 'cctv', wave: 3, dir: 'in', effort: 'L', recIds: ['cctv-ai'], cls: 'planned' },
  { key: 'gosi', wave: 3, dir: 'manual', effort: 'S', recIds: ['gosi'], cls: 'needs_client' },
  { key: 'hrms', wave: 3, dir: 'in', effort: 'M', recIds: ['hrms'] },
  { key: 'email', wave: 3, dir: 'out', effort: 'S', recIds: ['email-smtp'] },
  { key: 'sms', wave: 3, dir: 'out', effort: 'S', recIds: ['sms-twilio'] },
  { key: 'whatsapp', wave: 3, dir: 'inout', effort: 'S–M', recIds: ['whatsapp'] },
  { key: 'teams', wave: 3, dir: 'out', effort: 'S', recIds: ['teams', 'slack'] },
  { key: 'webpush', wave: 3, dir: 'out', effort: 'S', recIds: [], missing: true },
  { key: 'webhooks', wave: 3, dir: 'out', effort: 'S', recIds: ['webhooks'] },
  { key: 'demosources', wave: 3, dir: 'none', effort: null, recIds: ['google-sheets', 'supabase'], cls: 'built_demo' },
  { key: 'powerbi', wave: 3, dir: 'out', effort: 'S–M', recIds: ['powerbi'] },
].map((c) => Object.freeze({ ...c, recIds: Object.freeze([...(c.recIds || [])]) })));

/** Phases and weeks (plan §6, all estimates). P6 is open-ended (`open`). */
export const PHASES = Object.freeze([
  { id: 'P0', start: 1, end: 6 },
  { id: 'P1', start: 5, end: 14 },
  { id: 'P2', start: 9, end: 22 },
  { id: 'P3', start: 13, end: 26, field: true },
  { id: 'P4a', start: 17, end: 26, field: true },
  { id: 'P4b', start: 19, end: 34, field: true },
  { id: 'P5', start: 20, end: 34 },
  { id: 'P6', start: 35, end: 40, open: true },
].map((p) => Object.freeze(p)));

/** Milestones (plan §6, estimates). */
export const MILESTONES = Object.freeze([
  { id: 'MS1', week: 6 }, { id: 'MS2', week: 14 }, { id: 'MS3', week: 22 },
  { id: 'MS4', week: 26 }, { id: 'MS5', week: 34 }, { id: 'MS6', week: 36 },
].map((m) => Object.freeze(m)));

/** Weeks shown on the timeline (P6 continues past the end). */
export const TIMELINE_WEEKS = 40;

/** The four field priorities requested by BILTIX (plan §3), each with its sub-phases (estimates). */
export const PRIORITIES = Object.freeze([
  { key: 'offline', phase: 'P3', start: 13, end: 26, route: 'settings', steps: [{ id: 'a', start: 13, end: 18 }, { id: 'b', start: 17, end: 22 }, { id: 'c', start: 21, end: 26 }] },
  { key: 'qr', phase: 'P3', start: 13, end: 26, route: 'bom', steps: [{ id: 'a', start: 13, end: 18 }, { id: 'b', start: 17, end: 22 }, { id: 'c', start: 21, end: 26 }] },
  { key: 'plans', phase: 'P3', start: 13, end: 26, route: 'spatial', steps: [{ id: 'a', start: 13, end: 18 }, { id: 'b', start: 17, end: 22 }, { id: 'c', start: 21, end: 26 }] },
  { key: 'p360', phase: 'P4', start: 17, end: 34, route: 'spatial', steps: [{ id: 'a', start: 17, end: 26 }, { id: 'b', start: 19, end: 34 }] },
].map((p) => Object.freeze({ ...p, steps: Object.freeze(p.steps.map((s) => Object.freeze(s))) })));

/** On-the-ground needs (plan §3a–3d, §1.6). */
export const GROUND = Object.freeze(['network', 'power', 'devices', 'cameras', 'hosting']);

/** Client checklist (plan §6), grouped. Item ids are stable: they key the saved ticks. */
export const CHECKLIST = Object.freeze([
  { id: 'gov', items: ['gov1', 'gov2', 'gov3'] },
  { id: 'access', items: ['acc1', 'acc2', 'acc3'] },
  { id: 'data', items: ['dat1', 'dat2', 'dat3'] },
  { id: 'net', items: ['net1', 'net2', 'net3'] },
  { id: 'devices', items: ['dev1', 'dev2'] },
  { id: 'privacy', items: ['prv1', 'prv2', 'prv3'] },
  { id: 'security', items: ['sec1', 'sec2', 'sec3'] },
].map((g) => Object.freeze({ ...g, items: Object.freeze([...g.items]) })));

/** localStorage key for this browser's checklist ticks (a per-viewer convenience, never shared). */
export const CHECKLIST_STORAGE_KEY = 'biltix.golive.checklist.v1';

/* ───────────────────────────── pure helpers ───────────────────────────── */

/** Counts per go-live class. demoReady = built as demo + ready to connect (the demo shows them today). */
export function readiness(caps = CAPABILITIES) {
  const counts = Object.fromEntries(GL_STATUSES.map((s) => [s, 0]));
  for (const c of Array.isArray(caps) ? caps : []) {
    if (c && Object.prototype.hasOwnProperty.call(counts, c.status)) counts[c.status] += 1;
  }
  const total = GL_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return { counts, total, demoReady: counts.built_demo + counts.ready_connect };
}

/** Go-live class of a connector entry: explicit override, else missing → planned, else ready to connect. */
export function connectorClass(entry) {
  if (!entry) return 'planned';
  if (entry.cls && GL_STATUSES.includes(entry.cls)) return entry.cls;
  return entry.missing ? 'planned' : 'ready_connect';
}

/** The catalogue entry that describes a demo record id (or null). */
export function connectorFor(recId, list = CONNECTORS) {
  if (!recId) return null;
  return (Array.isArray(list) ? list : []).find((c) => c && Array.isArray(c.recIds) && c.recIds.includes(recId)) || null;
}

/** Catalogue entries in display order: the chain (wave 1, chain order), then wave 2, then wave 3. */
export function orderedConnectors(list = CONNECTORS) {
  return (Array.isArray(list) ? list : []).map((c, i) => ({ c, i }))
    .sort((a, b) => ((a.c.wave || 9) - (b.c.wave || 9)) || ((a.c.chain || 99) - (b.c.chain || 99)) || (a.i - b.i))
    .map((x) => x.c);
}

/** Sort rank of a demo record for "chain first" lists: 1–5 on the chain, else 100 (stable otherwise). */
export function chainRank(recId, list = CONNECTORS) {
  const c = connectorFor(recId, list);
  return c && c.wave === 1 && c.chain ? c.chain : 100;
}

/** Position of a week span on a timeline, in % of its width (inclusive weeks, 1-based). */
export function weekSpan(start, end, total = TIMELINE_WEEKS) {
  const T = Number(total) > 0 ? Number(total) : TIMELINE_WEEKS;
  const s = Math.min(Math.max(Number(start) || 1, 1), T);
  const e = Math.min(Math.max(Number(end) || s, s), T);
  return { startPct: ((s - 1) / T) * 100, widthPct: ((e - s + 1) / T) * 100 };
}

/** Duration in weeks of an inclusive span. */
export function spanWeeks(start, end) {
  const s = Number(start); const e = Number(end);
  return Number.isFinite(s) && Number.isFinite(e) && e >= s ? e - s + 1 : 0;
}

/** Every checklist item id, in order. */
export function checklistIds(groups = CHECKLIST) {
  return (Array.isArray(groups) ? groups : []).flatMap((g) => (g && Array.isArray(g.items) ? g.items : []));
}

/**
 * Saved ticks → a clean map { [itemId]: true } holding only known ids whose value is exactly true. Accepts the
 * parsed object or its JSON text; anything malformed yields {} (never throws).
 */
export function sanitizeChecklist(raw, ids = checklistIds()) {
  let obj = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return {}; } }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const known = new Set(ids);
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (known.has(k) && v === true) out[k] = true;
  return out;
}

/** Progress of the checklist: totals, an integer percentage and per-group counts. */
export function checklistProgress(checked, groups = CHECKLIST) {
  const ticks = checked && typeof checked === 'object' ? checked : {};
  const byGroup = {};
  let done = 0; let total = 0;
  for (const g of Array.isArray(groups) ? groups : []) {
    const items = g && Array.isArray(g.items) ? g.items : [];
    const d = items.filter((id) => ticks[id] === true).length;
    byGroup[g.id] = { done: d, total: items.length };
    done += d; total += items.length;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, byGroup };
}

/** SVG ring geometry: circumference and the dash offset that leaves `pct` (0–100) drawn. */
export function ringDash(pct, r) {
  const c = 2 * Math.PI * (Number(r) > 0 ? Number(r) : 0);
  const p = Math.min(Math.max(Number(pct) || 0, 0), 100);
  return { circumference: c, offset: c * (1 - p / 100) };
}

/* ───────────────────────────── architecture diagram ───────────────────────────── */

/**
 * Architecture layers in flow order (plan §1.2–1.3). `today`: what exists of the layer in this demo —
 * demo (works over demo/simulated data), partial (browser only), planned (nothing yet). `route` = deep link.
 */
export const ARCH_NODES = Object.freeze([
  { id: 'client', route: 'cockpit', today: 'demo' },
  { id: 'api', route: null, today: 'planned' },
  { id: 'hub', route: 'integrations', today: 'demo' },
  { id: 'bus', route: null, today: 'planned' },
  { id: 'data', route: 'dataquality', today: 'partial' },
  { id: 'ai', route: 'engine', today: 'demo' },
  { id: 'human', route: 'airisks', today: 'demo' },
  { id: 'notify', route: 'alerts', today: 'planned' },
  { id: 'edge', route: 'spatial', today: 'demo', site: true },
].map((n) => Object.freeze(n)));

/** Arrows: the flow, then the site edge feeding the event bus with events only. */
export const ARCH_LINKS = Object.freeze([
  ['client', 'api'], ['api', 'hub'], ['hub', 'bus'], ['bus', 'data'], ['data', 'ai'], ['ai', 'human'], ['human', 'notify'],
  ['edge', 'bus', 'events'],
].map((l) => Object.freeze(l)));

const ARCH_GAP = 7; // px between an arrow tip and the box it points at

function linkGeometry(a, b, rtl) {
  const acx = a.x + a.w / 2; const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2; const bcy = b.y + b.h / 2;
  if (Math.abs(a.y - b.y) < 1) { // same row
    const x1 = bcx > acx ? a.x + a.w : a.x;
    const x2 = bcx > acx ? b.x - ARCH_GAP : b.x + b.w + ARCH_GAP;
    return { d: `M${x1} ${acy} H${x2}`, lx: (x1 + x2) / 2, ly: acy - 8 };
  }
  if (Math.abs(a.x - b.x) < 1) { // same column
    const adjacent = Math.abs(bcy - acy) <= Math.max(a.h, b.h) * 2;
    if (adjacent) {
      const y1 = bcy > acy ? a.y + a.h : a.y;
      const y2 = bcy > acy ? b.y - ARCH_GAP : b.y + b.h + ARCH_GAP;
      return { d: `M${acx} ${y1} V${y2}`, lx: acx + (rtl ? -10 : 10), ly: (y1 + y2) / 2 };
    }
    // not adjacent: a bracket along the inline-end side of the column
    const side = rtl ? a.x : a.x + a.w;
    const sx = rtl ? side - 14 : side + 14;
    const tip = rtl ? side - ARCH_GAP : side + ARCH_GAP;
    return { d: `M${side} ${acy} H${sx} V${bcy} H${tip}`, lx: sx, ly: (acy + bcy) / 2 };
  }
  return { d: `M${acx} ${acy} L${bcx} ${bcy}`, lx: (acx + bcx) / 2, ly: (acy + bcy) / 2 };
}

/**
 * Diagram geometry. wide: a 3 × 3 snake (row 1 in reading order, row 2 back, row 3 forward) with the site edge
 * under the event bus; narrow: one column in flow order. `rtl` mirrors x so the flow follows the reading order.
 * → { W, H, nodes: { id: {x, y, w, h} }, links: [{ from, to, label, d, lx, ly }] }
 */
export function archLayout(mode = 'wide', rtl = false) {
  const wide = mode !== 'narrow';
  const nodes = {};
  let W; let H;
  if (wide) {
    W = 960; H = 452;
    const w = 280; const h = 108; const xs = [20, 340, 660]; const ys = [16, 172, 328];
    const grid = { client: [0, 0], api: [1, 0], hub: [2, 0], bus: [2, 1], data: [1, 1], ai: [0, 1], human: [0, 2], notify: [1, 2], edge: [2, 2] };
    for (const n of ARCH_NODES) { const [c, r] = grid[n.id]; nodes[n.id] = { x: xs[c], y: ys[r], w, h }; }
  } else {
    W = 360;
    const w = 296; const h = 104; const step = 140;
    ARCH_NODES.forEach((n, i) => { nodes[n.id] = { x: 16, y: 12 + i * step, w, h }; });
    H = 12 + ARCH_NODES.length * step - (step - h) + 12;
  }
  if (rtl) for (const p of Object.values(nodes)) p.x = W - p.x - p.w;
  const links = ARCH_LINKS.map(([from, to, label]) => ({ from, to, label: label || null, ...linkGeometry(nodes[from], nodes[to], rtl) }));
  return { W, H, nodes, links };
}
