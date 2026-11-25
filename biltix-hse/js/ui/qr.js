/**
 * BILTIX Risk AI — QR labels and scanning (js/ui/qr.js). Used by #/fieldkit (js/views/fieldkit.js).
 *
 *   Payload     "BX1:<K>:<ID>" — an opaque demo ID, never personal or free text. K: Z zone · E equipment
 *               (cranes, cameras) · M material / delivery (crates) · P permit. ID: A–Z, 0–9 and "-", ≤ 32 chars.
 *   makePayload(kind, id)        → 'BX1:Z:S1-Z2' (throws on an invalid kind or ID)
 *   parsePayload(input, {origin}) → { ok:true, kind, type, id, payload } | { ok:false, reason[, host] }
 *               Accepts the full payload, the short manual form "Z:S1-Z2", lower case and spaces, and a same-origin
 *               URL carrying ?code=… (in the query or the hash). A URL on another host is refused (reason 'foreign'):
 *               protection against QR phishing. reasons: empty · foreign · version · kind · format.
 *   qrMatrix(text, {ecl})        → { size, version, ecl, modules: boolean[][] } (vendored encoder, MIT; alphanumeric
 *               mode when the text allows it, else byte mode)
 *   qrPath(modules, margin)      → SVG path data (one "M x y h n v 1 h -n z" run per row segment)
 *   qrSvg(text, {ecl, margin, label}) → <svg> element (dark modules on white in every theme: scanners need contrast)
 *   scanSupport() / startScan(video, onCode) — BarcodeDetector + getUserMedia; the caller explains the camera
 *               permission first and always offers manual entry (iOS Safari and Firefox have no BarcodeDetector).
 *
 * The DOM is built with createElementNS / setAttribute only (no innerHTML).
 */
import qrcode from '../vendor/qrcode-generator.js';

export const QR_PREFIX = 'BX1';
export const QR_KINDS = Object.freeze({ Z: 'zone', E: 'equipment', M: 'material', P: 'permit' });
const KIND_CODES = Object.freeze(Object.fromEntries(Object.entries(QR_KINDS).map(([k, v]) => [v, k])));
export const QR_ID_RE = /^[A-Z0-9](?:[A-Z0-9-]{0,30}[A-Z0-9])?$/;
export const QR_PAYLOAD_RE = /^BX1:[ZEMP]:[A-Z0-9](?:[A-Z0-9-]{0,30}[A-Z0-9])?$/;
const ALNUM_RE = /^[0-9A-Z $%*+\-./:]*$/;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 'zone' | 'Z' + 'S1-Z2' → 'BX1:Z:S1-Z2'. */
export function makePayload(kind, id) {
  const k = QR_KINDS[kind] ? kind : KIND_CODES[kind];
  const value = String(id || '').trim().toUpperCase();
  if (!k) throw new Error(`unknown QR kind "${kind}"`);
  if (!QR_ID_RE.test(value)) throw new Error(`invalid QR id "${id}"`);
  return `${QR_PREFIX}:${k}:${value}`;
}

function codeFromUrl(raw, origin) {
  let url;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'format' }; }
  if (origin && url.origin !== origin) return { ok: false, reason: 'foreign', host: url.host };
  if (!origin) return { ok: false, reason: 'foreign', host: url.host };
  let code = url.searchParams.get('code');
  if (!code && url.hash.includes('?')) {
    try { code = new URLSearchParams(url.hash.slice(url.hash.indexOf('?') + 1)).get('code'); } catch { code = null; }
  }
  return code ? { ok: true, code } : { ok: false, reason: 'format' };
}

/** Parse a scanned or typed code. Never throws. */
export function parsePayload(input, { origin = '' } = {}) {
  let raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return { ok: false, reason: 'empty' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    const fromUrl = codeFromUrl(raw, origin);
    if (!fromUrl.ok) return fromUrl;
    raw = fromUrl.code.trim();
  }
  const norm = raw.toUpperCase().replace(/\s+/g, '').replace(/[‐-―−]/g, '-');
  const parts = norm.split(':');
  let version = QR_PREFIX;
  let rest = parts;
  if (parts.length === 3) { version = parts[0]; rest = parts.slice(1); } else if (parts.length !== 2) return { ok: false, reason: 'format' };
  if (version !== QR_PREFIX) return { ok: false, reason: /^BX\d+$/.test(version) ? 'version' : 'format' };
  const [k, id] = rest;
  if (!QR_KINDS[k]) return { ok: false, reason: 'kind' };
  if (!QR_ID_RE.test(id)) return { ok: false, reason: 'format' };
  return { ok: true, kind: k, type: QR_KINDS[k], id, payload: `${QR_PREFIX}:${k}:${id}` };
}

/** Module matrix for `text` (auto version, error-correction level 'L' | 'M' | 'Q' | 'H'). */
export function qrMatrix(text, { ecl = 'M' } = {}) {
  const value = String(text);
  const qr = qrcode(0, ['L', 'M', 'Q', 'H'].includes(ecl) ? ecl : 'M');
  qr.addData(value, ALNUM_RE.test(value) ? 'Alphanumeric' : 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const modules = [];
  for (let r = 0; r < size; r += 1) {
    const row = new Array(size);
    for (let c = 0; c < size; c += 1) row[c] = qr.isDark(r, c);
    modules.push(row);
  }
  return { size, version: (size - 17) / 4, ecl, modules };
}

/** Path data for the dark modules, offset by `margin` (quiet zone) modules. */
export function qrPath(modules, margin = 4) {
  let d = '';
  modules.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c += 1; continue; }
      let run = 1;
      while (c + run < row.length && row[c + run]) run += 1;
      d += `M${c + margin} ${r + margin}h${run}v1h-${run}z`;
      c += run;
    }
  });
  return d;
}

/** An <svg> QR code (crisp edges, white quiet zone). `label` becomes the accessible name. */
export function qrSvg(text, { ecl = 'M', margin = 4, label = '' } = {}) {
  const { size, modules } = qrMatrix(text, { ecl });
  const dim = size + margin * 2;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${dim} ${dim}`);
  svg.setAttribute('class', 'qr-svg');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label || String(text));
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', String(dim));
  bg.setAttribute('height', String(dim));
  bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', qrPath(modules, margin));
  path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}

/** What this browser can do for scanning. */
export function scanSupport() {
  const w = typeof window !== 'undefined' ? window : {};
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  return {
    detector: typeof w.BarcodeDetector === 'function',
    camera: Boolean(nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function'),
    secure: w.isSecureContext !== false,
  };
}

/**
 * Start the rear camera on `video` and call onCode(rawValue) once for the first QR code seen.
 * Resolves to { stop() }; rejects with the getUserMedia / detector error (the caller shows an honest message).
 */
export async function startScan(video, onCode, { intervalMs = 250 } = {}) {
  const sup = scanSupport();
  if (!sup.detector) throw Object.assign(new Error('BarcodeDetector unsupported'), { name: 'NotSupportedError' });
  const formats = typeof window.BarcodeDetector.getSupportedFormats === 'function' ? await window.BarcodeDetector.getSupportedFormats() : ['qr_code'];
  if (!formats.includes('qr_code')) throw Object.assign(new Error('qr_code format unsupported'), { name: 'NotSupportedError' });
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  let stopped = false;
  let timer = 0;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* already stopped */ } });
    try { video.srcObject = null; } catch { /* detached */ }
  };
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  try { await video.play(); } catch { /* autoplay policy: frames still arrive */ }
  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const found = await detector.detect(video);
        const hit = found && found.find((b) => b && b.rawValue);
        if (hit && !stopped) { stop(); onCode(String(hit.rawValue)); return; }
      }
    } catch { /* a frame that cannot be read: try the next one */ }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return { stop };
}

export default { QR_PREFIX, QR_KINDS, makePayload, parsePayload, qrMatrix, qrPath, qrSvg, scanSupport, startScan };
