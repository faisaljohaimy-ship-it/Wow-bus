#!/usr/bin/env node
/**
 * Framing check: projects the key text of every card through the camera paths (src/shots.ts and the
 * projection in src/lib/camera.ts) for every frame of every scene, in both languages (Arabic mirrors
 * the layout and the camera), and fails when key text would sit under the top bar's fade
 * (y < 148 px), into the caption band (y > 915 px; the band's fade starts at 890, the caption box at 944) or outside the 1920 px frame.
 *
 *   node scripts/check-framing.mjs            # exit 1 when a box leaves the safe area
 *
 * Boxes are world px of the left-to-right layout (the scenes' own coordinates). Windows `from`/`to`
 * are scene-relative frames: a box is only checked while its card is on screen. Intentional exits
 * are listed in ALLOWED with the reason.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(ROOT, 'package.json'));
const esbuild = require('esbuild'); // ships with @remotion/bundler

const TOP = 148;
const BOTTOM = 915;
const BOXES = {
  intro: [{ name: 'wordmark + tagline', x: 560, y: 572, w: 800, h: 180 }],
  source: [
    { name: 'sources heading', x: 132, y: 180, w: 628, h: 40, from: 66 },
    { name: 'records counter', x: 132, y: 750, w: 628, h: 120, from: 66 },
  ],
  validate: [
    { name: 'gate heading', x: 132, y: 180, w: 888, h: 40 },
    { name: 'KPI labels (upper)', x: 1108, y: 176, w: 688, h: 32 },
    { name: 'KPI labels (lower)', x: 1108, y: 563, w: 688, h: 32 },
  ],
  analyze: [
    { name: 'portfolio heading', x: 132, y: 180, w: 532, h: 40 },
    { name: 'categories heading', x: 754, y: 180, w: 340, h: 40 },
    { name: 'matrix heading', x: 1178, y: 180, w: 616, h: 40 },
    { name: 'matrix legend (rating counts)', x: 1178, y: 827, w: 616, h: 36 },
  ],
  explain: [
    { name: 'risk card heading', x: 132, y: 178, w: 848, h: 40 },
    { name: 'evidence heading', x: 1076, y: 178, w: 620, h: 40, depth: -40 },
    { name: 'evidence section labels', x: 1076, y: 820, w: 712, h: 50, depth: -40, from: 24 },
    { name: 'drivers card text', x: 132, y: 630, w: 848, h: 240, from: 30 },
  ],
  sitecam: [
    { name: 'viewer header', x: 224, y: 154, w: 1472, h: 40, from: 52 },
    { name: 'evidence panel', x: 1364, y: 212, w: 332, h: 520, from: 52 },
  ],
  approve: [
    { name: 'recommendation heading', x: 136, y: 184, w: 920, h: 40 },
    { name: 'decision buttons', x: 136, y: 802, w: 700, h: 64 },
    { name: 'reviewer header', x: 1160, y: 182, w: 624, h: 130 },
    { name: 'stakeholders', x: 1160, y: 780, w: 624, h: 90 },
  ],
  mitigate: [
    { name: 'task heading', x: 136, y: 182, w: 944, h: 40 },
    { name: 'task text column', x: 136, y: 182, w: 944, h: 600, from: 60 },
    { name: 'zone heading', x: 1174, y: 176, w: 620, h: 30, depth: -30 },
    { name: 'write-back text', x: 1174, y: 618, w: 620, h: 204, depth: -30, from: 30 },
  ],
  close: [
    { name: 'audit heading', x: 136, y: 178, w: 944, h: 40 },
    { name: 'seal caption', x: 1234, y: 652, w: 500, h: 150, from: 60 },
  ],
  outro: [],
};
// Camera moves that deliberately carry part of a card out of frame while the subject is elsewhere.
const ALLOWED = [
  // validate → analyze match: the push-in onto the validation ring / portfolio dial runs the far column's
  // ring gauges past the frame edge (their labels sit at the inline-start and stay in frame)
  { scene: 'validate', box: 'KPI labels (upper)', side: 'right' },
  { scene: 'validate', box: 'KPI labels (lower)', side: 'right' },
  // analyze opens on the portfolio dial (the match) and pulls back: the matrix is still entering on the far side
  { scene: 'analyze', box: 'matrix heading', side: 'right', to: 30 },
  { scene: 'analyze', box: 'matrix legend (rating counts)', side: 'right', to: 30 },
];

const entry = `
import { camAt, mirrorShot, planeAffine, applyAffine } from './src/lib/camera';
import { SHOTS } from './src/shots';
import { SCENES, sceneStart, TRANSITION } from './src/storyboard';
export { camAt, mirrorShot, planeAffine, applyAffine, SHOTS, SCENES, sceneStart, TRANSITION };
`;
const out = await esbuild.build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
const { camAt, mirrorShot, planeAffine, applyAffine, SHOTS, SCENES, sceneStart, TRANSITION } = mod;

const allowed = (scene, box, side, f) => ALLOWED.some((a) => a.scene === scene && a.box === box && a.side === side && (a.to ?? 1e9) >= f);
let bad = 0;
let checked = 0;
for (const lang of ['en', 'ar']) {
  const rtl = lang === 'ar';
  for (const s of SCENES) {
    const shots = SHOTS[s.id].map((k) => mirrorShot(k, rtl));
    // fully on screen from the end of its entrance (none for the intro or a hard cut) to its last frame
    const f0 = s.cut || s.id === 'intro' ? 0 : TRANSITION;
    for (let f = f0; f < s.frames; f += 1) {
      const cam = camAt(f, shots);
      for (const b of BOXES[s.id] || []) {
        if ((b.from ?? 0) > f || (b.to ?? 1e9) < f) continue;
        checked += 1;
        const m = planeAffine(cam, b.depth ?? 0);
        // Arabic: the same box on the mirrored layout (ALLOWED sides are named for the LTR layout)
        const x0 = rtl ? 1920 - b.x - b.w : b.x;
        const pts = [applyAffine(m, x0, b.y), applyAffine(m, x0 + b.w, b.y), applyAffine(m, x0, b.y + b.h), applyAffine(m, x0 + b.w, b.y + b.h)];
        const ys = pts.map((p) => p.y);
        const xs = pts.map((p) => p.x);
        const issues = [];
        if (Math.min(...ys) < TOP) issues.push(`top ${Math.min(...ys).toFixed(0)}`);
        if (Math.max(...ys) > BOTTOM) issues.push(`bottom ${Math.max(...ys).toFixed(0)}`);
        if (Math.min(...xs) < 8 && !allowed(s.id, b.name, rtl ? 'right' : 'left', f)) issues.push(`left ${Math.min(...xs).toFixed(0)}`);
        if (Math.max(...xs) > 1912 && !allowed(s.id, b.name, rtl ? 'left' : 'right', f)) issues.push(`right ${Math.max(...xs).toFixed(0)}`);
        if (issues.length) {
          bad += 1;
          console.log(`${lang} ${s.id} f${f} (frame ${sceneStart(s.id) + f}) ${b.name}: ${issues.join(', ')}`);
        }
      }
    }
  }
}
console.log(`${checked} box-frames checked (both languages): ${bad ? `${bad} outside the safe area` : 'all key text inside the safe area'}`);
process.exit(bad ? 1 : 0);
