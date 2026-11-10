/**
 * Camera paths, one shot list per scene (frames relative to the scene start, world px of the
 * left-to-right layout; Arabic mirrors them). Every move is motivated:
 *  - intro      slow push-in with a small orbit onto the emblem
 *  - source     match cut: starts close on the ingestion hub where the intro emblem sat, pulls back
 *               to reveal the radial feeds, then drifts toward the records counter
 *  - validate   continues that drift, settles wide, then pushes in on the validation ring
 *  - analyze    opens on the portfolio dial at the ring's screen spot (match), pulls back while the
 *               dials sweep, then pushes in on the story risk's matrix cell
 *  - explain    opens on the risk card, rack-focuses to the evidence and pushes into the section
 *  - sitecam    hard cut to the simulated feed, full frame, pulling back to reveal the viewer
 *  - approve    settles on the recommendation, pushes in on the decision, crosses to the clock
 *  - mitigate   task, then the exclusion zone, then the (simulated) write-back
 *  - close      tilts down the audit trail and ends on the seal
 *  - outro      match: the step ring starts at the seal's screen size and spot; the camera cranes in
 *
 * A push-in uses aim(): it brings a world point to a chosen screen point at a dolly position, so
 * the detail grows toward the centre without the frame running off the edge of the layout
 * (margins stay ≤ ≈ 250 px) and without lifting key text under the top bar or the caption band.
 * Moves stay slow: magnification 0.65–1.12 on the action plane, except the opening frames of the
 * source match (1.65) and of the full-frame camera feed (1.72), which only pull back; the largest
 * pan is the outro crane (≈ 650 world px, ≈ 430 px on screen, over 2.2 s), all eased at both ends.
 */
import type { Shot } from './lib/camera';
import type { SceneId } from './storyboard';
import { EASE, LENS } from './theme';

const m = (z: number) => LENS / (LENS - z);
/** Focus that puts world point (px, py) at screen point (sx, sy) with the camera at dolly z. */
function aim(px: number, py: number, sx: number, sy: number, z: number): { x: number; y: number; z: number } {
  return { x: px - (sx - 960) / m(z), y: py - (sy - 540) / m(z), z };
}

// Anchors shared with the scenes (world px, left-to-right layout).
const HUB = { x: 1330, y: 540 }; // scenes/Source.tsx
const VRING = { x: 520, y: 604 }; // scenes/Validate.tsx
const DIAL = { x: 398, y: 598 }; // scenes/Analyze.tsx
const CELL = { x: 1318 + 4 * 84 + 39, y: 300 + 39 }; // story cell L5 × I5, scenes/Analyze.tsx
const SECTION = { x: 1434, y: 760 }; // evidence schematic, scenes/Explain.tsx
const ACCEPT = { x: 248, y: 834 }; // the Accept button, scenes/Approve.tsx
const CLOCK = { x: 1302, y: 498 }; // decision clock, scenes/Approve.tsx
const ZONE = { x: 1484, y: 360 }; // exclusion-zone card, scenes/Mitigate.tsx
const WRITEBACK = { x: 1484, y: 747 }; // write-back card, scenes/Mitigate.tsx
const SEAL = { x: 1484, y: 440 }; // scenes/Close.tsx
const FEED = { x: 782, y: 526 }; // simulated camera feed centre, scenes/SiteCam.tsx

// Match points: where the hand-off detail sits on screen across a dissolve.
const RING_SPOT = { x: 640, y: 584 }; // validation ring → portfolio dial
const SEAL_SPOT = { z: 40, focus: { x: 1062, y: 470 } }; // close ends here; the outro ring starts on the seal

export const SHOTS: Record<SceneId, Shot[]> = {
  intro: [
    { f: 0, x: 960, y: 470, z: 0, yaw: 1.6 },
    { f: 87, x: 960, y: 400, z: 80, yaw: 0, ease: EASE.soft },
  ],
  source: [
    // intro emblem (210 px at m 1.038, centre 509 px) = hub emblem (132 px) at m 1.652
    { f: 0, x: HUB.x, y: 559, z: 868 },
    { f: 10, x: HUB.x, y: 558, z: 845, ease: EASE.soft },
    { f: 70, x: 960, y: 540, z: 0 },
    { f: 141, x: 900, y: 555, z: 60, yaw: -1.2, ease: EASE.soft },
  ],
  validate: [
    { f: 0, x: 1000, y: 535, z: 50, yaw: -0.8 },
    { f: 46, x: 960, y: 540, z: 0, yaw: 0 },
    { f: 86, x: 960, y: 540, z: 0 },
    { f: 141, ...aim(VRING.x, VRING.y, RING_SPOT.x, RING_SPOT.y, 110), yaw: 1.0 },
  ],
  analyze: [
    { f: 0, ...aim(DIAL.x, DIAL.y, RING_SPOT.x, RING_SPOT.y, 110), yaw: 1.0 },
    { f: 66, x: 960, y: 540, z: 0, yaw: 0 },
    { f: 104, x: 960, y: 540, z: 0 },
    { f: 180, ...aim(CELL.x, CELL.y, 1560, 380, 170), yaw: -1.4 },
  ],
  explain: [
    { f: 0, x: 800, y: 470, z: 120, yaw: -1.0 },
    { f: 42, x: 900, y: 510, z: 50, yaw: 0 },
    { f: 70, x: 900, y: 510, z: 50 },
    { f: 108, x: 1040, y: 520, z: 70, yaw: -1.0 },
    { f: 156, ...aim(SECTION.x, SECTION.y, 1300, 650, 230), yaw: 0 },
  ],
  sitecam: [
    // the 1116 × 628 feed fills the 1920 × 1080 frame at m 1.72
    { f: 0, x: FEED.x, y: FEED.y, z: 921 },
    { f: 12, x: FEED.x, y: FEED.y, z: 890, ease: EASE.soft },
    { f: 66, x: 960, y: 522, z: 0 },
    { f: 105, x: 980, y: 524, z: 30, yaw: -0.6, ease: EASE.soft },
  ],
  approve: [
    { f: 0, x: 1000, y: 530, z: 60, yaw: -0.8 },
    { f: 38, x: 920, y: 520, z: 30, yaw: 0 },
    { f: 52, x: 920, y: 520, z: 30 },
    { f: 72, ...aim(ACCEPT.x, ACCEPT.y, 420, 780, 140) },
    { f: 92, ...aim(ACCEPT.x, ACCEPT.y, 420, 780, 150) },
    { f: 153, ...aim(CLOCK.x, CLOCK.y, 1250, 520, 70), yaw: -1.0 },
  ],
  mitigate: [
    { f: 0, x: 840, y: 470, z: 110, yaw: 0.8 },
    { f: 44, x: 900, y: 520, z: 30, yaw: 0 },
    { f: 64, x: 900, y: 520, z: 30 },
    { f: 104, ...aim(ZONE.x, ZONE.y, 1400, 400, 90), yaw: -1.0 },
    { f: 147, ...aim(WRITEBACK.x, WRITEBACK.y, 1380, 640, 120), yaw: 0 },
  ],
  close: [
    { f: 0, x: 820, y: 470, z: 90, yaw: 0.6 },
    { f: 64, x: 860, y: 600, z: 50, yaw: 0 },
    { f: 96, x: 960, y: 540, z: 0 },
    { f: 168, x: SEAL_SPOT.focus.x, y: SEAL_SPOT.focus.y, z: SEAL_SPOT.z, ease: EASE.soft },
  ],
  outro: (() => {
    // the seal's ring (r 186 at m(40)) sits at this screen point when the close scene ends …
    const sx = 960 + (SEAL.x - SEAL_SPOT.focus.x) * m(SEAL_SPOT.z);
    const sy = 540 + (SEAL.y - SEAL_SPOT.focus.y) * m(SEAL_SPOT.z);
    // … and the outro ring (r 288 round (960, 500)) starts there at the same radius: m = 186·m(40)/288
    const z0 = LENS * (1 - 288 / (186 * m(SEAL_SPOT.z)));
    return [
      { f: 0, ...aim(960, 500, sx, sy, z0) },
      { f: 66, x: 960, y: 500, z: 0 },
      { f: 87, x: 960, y: 500, z: 24, ease: EASE.soft },
    ];
  })(),
};
