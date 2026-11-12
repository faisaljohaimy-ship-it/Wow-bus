/**
 * Icon effect (css/components.css "Icon effect"): every UI icon (svg.icon) rests as a piece of clear glass and, in a
 * wave that crosses the screen from the reading start, melts, vanishes and comes back as glass.
 *
 * Technique: liquid displacement with lit glass, in shared SVG filters (one hidden <svg> of definitions).
 *   - Resting glass (#ifx-rest, referenced by the CSS): the icon's own alpha, blurred, is a height map; one point
 *     light above the upper reading-start corner gives a specular edge on the lit flank, a shade and a thin tinted
 *     glint (refraction) on the far flank and a soft fall-off across the icon; a translucent body and a tinted
 *     caustic shadow sit under it. The light adds little to a dark ink and the shade takes little from a light ink,
 *     so the body keeps its contrast on either theme.
 *   - Melt (#ifx-s1 …): column noise × a ramp down the icon drives a displacement map, so every column is stretched
 *     from its top (the lines sag, a few columns run far) and wobbles a little sideways; a downward blur and an alpha
 *     threshold turn the result into liquid, which is lit as glass again, so the drips shine. Meanwhile the icon
 *     itself stretches downward from its top edge. Vanish: the liquid is eroded until nothing is left.
 *   - Glass return: the icon arrives out of blur and scale, then wears the resting glass while a second, low light
 *     crosses it from the reading start (the glint), and settles on the resting filter.
 *
 * A cycle is one Web Animation per icon (scale, translate, opacity: compositor only) plus the filter stages, which
 * are plain style changes taken from that animation's clock. They are deliberately not a filter animation: an
 * animated filter is applied by the compositor on every frame; a styled one is painted into the icon's layer once per
 * stage, on the raster threads. Paint only: no layout property, no DOM change inside or around an icon (one inline
 * `filter` while its cycle runs), no change to the accessibility tree. The one node this module adds is an
 * aria-hidden, zero-size <svg> that holds the filters.
 *
 * When it plays (attribute on <html>, set by the settings screen; absent = "cycle"):
 *   data-iconfx="cycle"  once for the icons in view when the page opens or the route changes, once when an icon first
 *                        scrolls into view, then an ambient wave every 10 to 14 s while the page is visible;
 *   data-iconfx="enter"  the same without the ambient waves;
 *   data-iconfx="off"    resting glass only.
 * Never on an icon whose control is hovered, focused or pressed; a cycle ends at once when the reader hovers, focuses
 * or presses the control; any pointer or key press holds the ambient wave for a few seconds. Reduced motion (the OS
 * setting unless html[data-motion="full"], or html[data-motion="reduce"]): resting glass, no animation. Printing and
 * forced colours: plain icons (CSS). Only icons inside the window animate; a hidden tab stops everything. A wave
 * takes at most MAX_ACTIVE icons, and fewer after an ambient wave that ran slowly on this device (the governor).
 *
 * Captures: window.__iconFx = { play({ paused }), seek(ms, { local }), rest(), delayOf(icon), duration, cycle }.
 * `duration` is the wave from the first icon's start to the last icon's end, `cycle` one icon. seek() pauses every
 * running cycle at a wave time (or, with { local: true }, every icon at that time of its own cycle) and puts the
 * matching filter stage on at once. The animations are also in document.getAnimations(): pause or seek them there
 * and the stages follow on the next frame. play() takes every icon in view (up to MAX_ACTIVE);
 * play({ governed: true }) takes what an ordinary wave would take on this device.
 */

const NS = 'http://www.w3.org/2000/svg';
const ICON = 'svg.icon';
// The control an icon belongs to: a widget the reader operates, not a focusable container (main, a dialog, a panel).
const CONTROL = 'button, a[href], summary, label, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="link"], [role="checkbox"], [role="radio"], '
  + '[tabindex="0"]:not(main):not(dialog):not(section):not([role="dialog"]):not([role="tabpanel"]):not([role="region"]):not([role="group"]):not([role="log"])';
const DEFS_ID = 'ifx-defs';

/* ------------------------------------------------------------------ */
/* Timeline (ms)                                                       */
/* ------------------------------------------------------------------ */

const CYCLE = 2400;            // one icon: melt → vanish → gone → glass return
const MELT_AT = 60;            // the first liquid stage
const MELT_STAGES = 9;
const MELT_STEP = 107;         // 60 … 1020
const VANISH_AT = 1020;
const VANISH_STAGES = 3;
const VANISH_STEP = 93;        // 1020 … 1300
const GONE_AT = 1300;          // fully transparent from here …
const RETURN_AT = 1560;        // … to here (260 ms)
const FOCUS = [0.17, 0.11, 0.06, 0.025];   // the glass arrives out of blur: blur of each step (fraction of the icon)
const FOCUS_STEP = 60;         // 1560 … 1800
const GLINT_STAGES = 5;        // then the light crosses it
const GLINT_STEP = 76;         // 1800 … 2180, then the resting filter
const SETTLE_AT = 2300;        // scale and opacity are home
const STAGE_BEAT = 50;         // stage changes of all icons are taken together, this often

const WAVE_SPREAD = 650;       // delay from the reading-start edge of the window to the far edge
const WAVE_ROW = 450;          // plus this from the top of the window to the bottom (rail items follow each other)
const ROUTE_WINDOW = 1400;     // icons a new page adds this long after it opened still join its wave
const AMBIENT_MIN = 10000;
const AMBIENT_MAX = 14000;
const HOLD_MS = 4000;          // no ambient wave this long after a pointer or key press
const MAX_ACTIVE = 40;         // icons mid-cycle at once (a 1440 × 900 window holds 33 to 48)
const MIN_WAVE = 10;           // the governor never takes a wave below this
const SLOW_FRAME = 24;         // mean frame time (ms) of a wave above which the next wave takes fewer icons
const FAST_FRAME = 20;         // … and below which it may take more again

const EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_IN = 'cubic-bezier(0.55, 0, 0.9, 0.5)';
const EASE_IN_SOFT = 'cubic-bezier(0.4, 0, 0.8, 0.6)';

/* ------------------------------------------------------------------ */
/* Glass and liquid parameters (lengths are fractions of the icon box) */
/* ------------------------------------------------------------------ */

const GLASS = {
  bump: 0.03,          // blur of the alpha → height map
  relief: 6,           // surfaceScale
  spec: 2.6,           // specularConstant
  shine: 9,            // specularExponent
  rim: 0.45,           // shade on the flank away from the light
  refract: [3, 0.8],   // tinted glint at the sharpest part of that flank → alpha = refract[0] * a - refract[1]
  light: [-0.05, -0.12, 0.5],
  lit: [2.4, 1.2],     // fall-off of the light across the icon → alpha = lit[0] * g - lit[1]
  dim: [1.8, 1.05],    // shade far from the light → alpha = dim[1] - dim[0] * g
  hi: [0.08, 1.3],     // light kept on an ink of luma L: hi[0] + hi[1] * L
  lo: [1.35, 1.15],    // shade kept on an ink of luma L: lo[0] - lo[1] * L
  body: [0.82, 0.17],  // opacity of the glass body on an ink of luma L: body[0] + body[1] * L
  bloom: 0.025,
  shadow: [0.045, 0.09, 0.06],
};

/* ------------------------------------------------------------------ */
/* Filter definitions                                                  */
/* ------------------------------------------------------------------ */

const r4 = (v) => Math.round(v * 10000) / 10000;

function node(tag, attrs, kids) {
  const el = document.createElementNS(NS, tag);
  for (const key of Object.keys(attrs || {})) el.setAttribute(key, String(typeof attrs[key] === 'number' ? r4(attrs[key]) : attrs[key]));
  if (kids) for (const kid of kids) el.appendChild(kid);
  return el;
}

const matrix = (rows, extra) => node('feColorMatrix', { type: 'matrix', values: rows.map((row) => row.map(r4).join(' ')).join('  '), ...extra });
const ZERO = [0, 0, 0, 0, 0];
const ONE = [0, 0, 0, 0, 1];
const LUMA = [0.2126, 0.7152, 0.0722];

/**
 * The lit-glass primitives for the graphic named `src` (its alpha is the height map).
 * o: { rtl, gain = 1 (specular), wash = 1 (the light's fall-off), glint: { x, y, a } | null }
 */
function glassPrims(src, o) {
  const g = GLASS;
  const fx = (x) => (o.rtl ? 1 - x : x);
  const gain = o.gain || 1;
  const light = () => node('fePointLight', { x: fx(g.light[0]), y: g.light[1], z: g.light[2] });
  const far = () => node('fePointLight', { x: fx(1 - g.light[0]), y: 1 - g.light[1], z: g.light[2] });
  const out = [];
  out.push(node('feGaussianBlur', { in: src, stdDeviation: g.bump, result: 'h' }));
  // Lit flank and its bloom.
  out.push(node('feSpecularLighting', { in: 'h', surfaceScale: g.relief, specularConstant: g.spec * gain, specularExponent: g.shine, 'lighting-color': '#fff', result: 'sp' }, [light()]));
  // Far flank: the same relief lit from the opposite corner, turned into shade.
  out.push(node('feSpecularLighting', { in: 'h', surfaceScale: g.relief, specularConstant: g.spec, specularExponent: Math.max(4, g.shine * 0.6), 'lighting-color': '#fff', result: 'sd' }, [far()]));
  out.push(matrix([ZERO, ZERO, ZERO, [0, 0, 0, g.rim, 0]], { in: 'sd', result: 'sdK' }));
  // … and, at its sharpest, a thin tinted glint: light refracted through the far edge (colour from the CSS block).
  if (g.refract[0] > 0) {
    out.push(matrix([ZERO, ZERO, ZERO, [0, 0, 0, g.refract[0], -g.refract[1]]], { in: 'sd', result: 'sdPeak' }));
    out.push(node('feFlood', { class: 'ifx-refract', result: 'tint' }));
    out.push(node('feComposite', { in: 'tint', in2: 'sdPeak', operator: 'in', result: 'tintPeak' }));
    out.push(node('feComposite', { in: 'tintPeak', in2: src, operator: 'in', result: 'refr' }));
  }
  // The light's fall-off over a flat plane: bright near the lit corner, dark at the far one.
  out.push(node('feFlood', { 'flood-color': '#000', result: 'flat' }));
  out.push(node('feDiffuseLighting', { in: 'flat', surfaceScale: 1, diffuseConstant: o.wash || 1, 'lighting-color': '#fff', result: 'fall' }, [light()]));
  out.push(matrix([ONE, ONE, ONE, [g.lit[0], 0, 0, 0, -g.lit[1]]], { in: 'fall', result: 'gl' }));
  out.push(matrix([ZERO, ZERO, ZERO, [-g.dim[0], 0, 0, 0, g.dim[1]]], { in: 'fall', result: 'gs' }));
  out.push(node('feMerge', { result: 'lightAll' }, [node('feMergeNode', { in: 'gl' }), node('feMergeNode', { in: 'sp' })]));
  out.push(node('feMerge', { result: 'shadeAll' }, [node('feMergeNode', { in: 'gs' }), node('feMergeNode', { in: 'sdK' })]));
  // How much light / shade this ink takes: little light on a dark ink, little shade on a light ink.
  out.push(matrix([ONE, ONE, ONE, [...LUMA.map((w) => w * g.hi[1]), g.hi[0], 0]], { in: src, result: 'mHi' }));
  out.push(matrix([ZERO, ZERO, ZERO, [...LUMA.map((w) => -w * g.lo[1]), g.lo[0], 0]], { in: src, result: 'mLo' }));
  out.push(node('feComposite', { in: 'lightAll', in2: 'mHi', operator: 'in', result: 'lightIn' }));
  out.push(node('feComposite', { in: 'shadeAll', in2: 'mLo', operator: 'in', result: 'shadeIn' }));
  out.push(node('feGaussianBlur', { in: 'lightIn', stdDeviation: g.bloom, result: 'lightBloom' }));
  // Translucent body over its caustic shadow (colour and strength come from the CSS block, per theme).
  out.push(matrix([ZERO, ZERO, ZERO, [...LUMA.map((w) => w * g.body[1]), 0, g.body[0]]], { in: src, result: 'mBody' }));
  out.push(node('feComposite', { in: src, in2: 'mBody', operator: 'in', result: 'body' }));
  out.push(node('feDropShadow', { in: 'body', dx: (o.rtl ? -1 : 1) * g.shadow[0], dy: g.shadow[1], stdDeviation: g.shadow[2], class: 'ifx-caustic', result: 'based' }));
  const layers = ['based', 'shadeIn', ...(g.refract[0] > 0 ? ['refr'] : []), 'lightBloom', 'lightIn'];
  if (o.glint && o.glint.a > 0.01) {
    // The glint: a second, low light crossing the icon; it lights whatever ink it passes and flares a little.
    const spot = () => node('fePointLight', { x: fx(o.glint.x), y: o.glint.y, z: 0.22 });
    out.push(node('feDiffuseLighting', { in: 'flat', surfaceScale: 1, diffuseConstant: 1, 'lighting-color': '#fff', result: 'gfall' }, [spot()]));
    out.push(matrix([ONE, ONE, ONE, [3.2 * o.glint.a, 0, 0, 0, -2.1 * o.glint.a]], { in: 'gfall', result: 'gspot' }));
    out.push(node('feSpecularLighting', { in: 'h', surfaceScale: g.relief, specularConstant: 3.2 * o.glint.a, specularExponent: 7, 'lighting-color': '#fff', result: 'gsp' }, [spot()]));
    out.push(node('feMerge', { result: 'gAll' }, [node('feMergeNode', { in: 'gspot' }), node('feMergeNode', { in: 'gsp' })]));
    out.push(node('feComposite', { in: 'gAll', in2: src, operator: 'in', result: 'gIn' }));
    out.push(node('feGaussianBlur', { in: 'gIn', stdDeviation: 0.07, result: 'gFlare' }));
    layers.push('gFlare', 'gIn');
  }
  out.push(node('feMerge', { result: 'glass' }, layers.map((name) => node('feMergeNode', { in: name }))));
  return out;
}

/**
 * Liquid glass for the melting stages: the resting glass without its light fall-off and bloom (translucent body,
 * specular edge, shade and tinted glint on the far flank), so the first liquid stage follows the resting look
 * without a jump and the later ones cost about half of it. These stages are repainted about ten times a second on
 * every melting icon.
 * o: { rtl, gain = 1, thin = 1, narrow = 0 (keeps the tinted glint thin on wide liquid), shadow = 0 (0..1 of the
 *      resting caustic), fade = 1 }
 */
function liquidGlassPrims(src, o) {
  const g = GLASS;
  const dir = o.rtl ? -1 : 1;
  const fx = (x) => (o.rtl ? 1 - x : x);
  const out = [];
  out.push(node('feGaussianBlur', { in: src, stdDeviation: g.bump, result: 'h' }));
  out.push(node('feSpecularLighting', { in: 'h', surfaceScale: g.relief, specularConstant: g.spec * (o.gain || 1), specularExponent: g.shine, 'lighting-color': '#fff', result: 'sp' },
    [node('fePointLight', { x: fx(g.light[0]), y: g.light[1], z: g.light[2] })]));
  out.push(matrix([ONE, ONE, ONE, [...LUMA.map((w) => w * g.hi[1]), g.hi[0], 0]], { in: src, result: 'mHi' }));
  out.push(node('feComposite', { in: 'sp', in2: 'mHi', operator: 'in', result: 'lightIn' }));
  out.push(node('feSpecularLighting', { in: 'h', surfaceScale: g.relief, specularConstant: g.spec, specularExponent: Math.max(4, g.shine * 0.6), 'lighting-color': '#fff', result: 'sd' },
    [node('fePointLight', { x: fx(1 - g.light[0]), y: 1 - g.light[1], z: g.light[2] })]));
  out.push(matrix([ZERO, ZERO, ZERO, [0, 0, 0, g.rim, 0]], { in: 'sd', result: 'sdK' }));
  out.push(node('feComposite', { in: 'sdK', in2: src, operator: 'in', result: 'shadeIn' }));
  out.push(matrix([ZERO, ZERO, ZERO, [0, 0, 0, g.refract[0], -g.refract[1] - (o.narrow || 0)]], { in: 'sd', result: 'sdPeak' }));
  out.push(node('feFlood', { class: 'ifx-refract', result: 'tint' }));
  out.push(node('feComposite', { in: 'tint', in2: 'sdPeak', operator: 'in', result: 'tintPeak' }));
  out.push(node('feComposite', { in: 'tintPeak', in2: src, operator: 'in', result: 'refr' }));
  const thin = o.thin === undefined ? 1 : o.thin;
  out.push(matrix([ZERO, ZERO, ZERO, [...LUMA.map((w) => w * g.body[1] * thin), 0, g.body[0] * thin]], { in: src, result: 'mBody' }));
  out.push(node('feComposite', { in: src, in2: 'mBody', operator: 'in', result: 'body' }));
  const layers = ['body', 'shadeIn', 'refr', 'lightIn'];
  if (o.shadow > 0.02) {
    out.push(node('feDropShadow', { in: 'body', dx: dir * g.shadow[0], dy: g.shadow[1], stdDeviation: g.shadow[2], class: 'ifx-caustic', style: `flood-opacity: calc(var(--ifx-caustic-a) * ${r4(o.shadow)})`, result: 'based' }));
    layers[0] = 'based';
  }
  out.push(node('feMerge', { result: 'glass' }, layers.map((name) => node('feMergeNode', { in: name }))));
  if (o.fade !== undefined && o.fade < 0.999) out.push(matrix([[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, o.fade, 0]], {}));
  return out;
}

/**
 * The liquid primitives: SourceGraphic → "melt".
 * m: 0..1 how far the melt has gone; v: 0..1 how far the vanish has gone.
 */
function liquidPrims(m, v) {
  const run = 1.5 * Math.pow(m, 1.6) * (1 + 0.45 * v); // the lowest part of a running column moves down by half of this
  const smear = 0.02 + 0.06 * Math.pow(m, 1.2) * (1 + 0.5 * v);
  const soft = 0.01 + 0.022 * m;
  const gain = 1.8 + 3.2 * m;                          // threshold slope: the blurred lines become liquid again
  const cut = 0.2 + 0.6 * m + 2.2 * v;                 // … and erode
  const out = [];
  // How far each column runs: noise that changes fast across and hardly at all downward, shaped so that every
  // column sags a little and a few run far (G: one half = stays, one = taken from far above, i.e. it has run down);
  // R wanders a little around one half, so the lines also wobble sideways.
  out.push(node('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.21 0.008', numOctaves: 1, seed: 3, result: 'noise' }));
  out.push(node('feComponentTransfer', { in: 'noise', result: 'cols' }, [
    node('feFuncR', { type: 'linear', slope: 0.1, intercept: 0.45 }),
    node('feFuncG', { type: 'table', tableValues: '0.61 0.61 0.65 0.875 1 1' }),
    node('feFuncA', { type: 'table', tableValues: '1 1' }),
  ]));
  // A ramp down the icon (a flood over its lower half, blurred downward): nothing moves at the top edge, the pull
  // grows downward and is whole under the icon. Over mid-grey (no pull) the ramp lets the column pull through,
  // which stretches each column from its top: the lines sag and run.
  out.push(node('feFlood', { 'flood-color': '#fff', x: -1, y: 0.5, width: 3, height: 3, result: 'lower' }));
  out.push(node('feGaussianBlur', { in: 'lower', stdDeviation: '0 0.28', result: 'ramp' }));
  out.push(node('feComposite', { in: 'cols', in2: 'ramp', operator: 'in', result: 'pull' }));
  out.push(node('feFlood', { 'flood-color': '#808080', result: 'still' }));
  out.push(node('feMerge', { result: 'map' }, [node('feMergeNode', { in: 'still' }), node('feMergeNode', { in: 'pull' })]));
  out.push(node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: -run, xChannelSelector: 'R', yChannelSelector: 'G', result: 'ran' }));
  // Soften, more downward than sideways, then threshold the alpha: liquid with rounded ends.
  out.push(node('feGaussianBlur', { in: 'ran', stdDeviation: `${r4(soft)} ${r4(smear)}`, result: 'goo' }));
  out.push(node('feComponentTransfer', { in: 'goo', result: 'melt' }, [node('feFuncA', { type: 'linear', slope: gain, intercept: -cut })]));
  return out;
}

const BOX_REST = { x: '-25%', y: '-25%', width: '150%', height: '160%' };     // shadow, bloom
const BOX_LIQUID = { x: '-20%', y: '-10%', width: '140%', height: '225%' };   // room for the liquid to run down
const BOX_FOCUS = { x: '-60%', y: '-60%', width: '220%', height: '220%' };    // room for the blur
const BOX_GLINT = { x: '-30%', y: '-30%', width: '160%', height: '170%' };    // room for the flare

function filterEl(id, prims, box) {
  return node('filter', { id, ...box, primitiveUnits: 'objectBoundingBox', 'color-interpolation-filters': 'sRGB' }, prims);
}

/** All stages for one light direction, in the order of the stage table. */
function buildFilters(rtl) {
  const list = [filterEl('ifx-rest', glassPrims('SourceGraphic', { rtl }), BOX_REST)];
  let k = 0;
  for (let i = 1; i <= MELT_STAGES; i++) {
    const m = i / MELT_STAGES;
    list.push(filterEl(`ifx-s${++k}`, [...liquidPrims(m, 0), ...liquidGlassPrims('melt', { rtl, gain: 1 + 0.6 * m, thin: 1 - 0.2 * m, narrow: 0.7 * m, shadow: 1 - 3 * m })], BOX_LIQUID));
  }
  for (let j = 1; j <= VANISH_STAGES; j++) {
    const v = j / VANISH_STAGES;
    list.push(filterEl(`ifx-s${++k}`, [...liquidPrims(1, v), ...liquidGlassPrims('melt', { rtl, gain: 1.6, thin: 0.8, narrow: 0.7, fade: 1 - 0.6 * v })], BOX_LIQUID));
  }
  // Out of blur: nothing but the blur while the icon is far out of focus, then the blurred shape lit as glass.
  FOCUS.forEach((blur, index) => {
    const soft = node('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur, result: 'soft' });
    const prims = index < FOCUS.length - 2
      ? [soft, matrix([[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0.9, 0]], {})]
      : [soft, ...liquidGlassPrims('soft', { rtl, gain: 1.4, thin: 0.95, shadow: index === FOCUS.length - 1 ? 0.7 : 0.35 })];
    list.push(filterEl(`ifx-s${++k}`, prims, BOX_FOCUS));
  });
  // In focus: the resting glass, a little brighter at first, while the glint crosses it.
  for (let q = 0; q < GLINT_STAGES; q++) {
    const g = (q + 0.5) / GLINT_STAGES;
    const glint = { x: -0.35 + 1.7 * g, y: -0.3 + 1.6 * g, a: Math.pow(Math.sin(Math.PI * g), 0.7) };
    list.push(filterEl(`ifx-s${++k}`, glassPrims('SourceGraphic', { rtl, gain: 1 + 0.5 * (1 - g), wash: 1 + 0.35 * (1 - g), glint }), BOX_GLINT));
  }
  return list;
}

/**
 * The stage table of one cycle: [start in ms, filter], in order. Before the first entry and from the last one on
 * the icon wears its resting filter (the CSS rule).
 */
function stageTable() {
  const table = [];
  let k = 0;
  for (let i = 0; i < MELT_STAGES; i++) table.push([MELT_AT + i * MELT_STEP, `url(#ifx-s${++k})`]);
  for (let j = 0; j < VANISH_STAGES; j++) table.push([VANISH_AT + j * VANISH_STEP, `url(#ifx-s${++k})`]);
  // The first out-of-focus stage is put on while the icon is still invisible, so the return starts on a painted layer.
  for (let f = 0; f < FOCUS.length; f++) table.push([f === 0 ? GONE_AT + 40 : RETURN_AT + f * FOCUS_STEP, `url(#ifx-s${++k})`]);
  const lit = RETURN_AT + FOCUS.length * FOCUS_STEP;
  for (let q = 0; q < GLINT_STAGES; q++) table.push([lit + q * GLINT_STEP, `url(#ifx-s${++k})`]);
  table.push([lit + GLINT_STAGES * GLINT_STEP, '']);
  return table;
}

/** The filter an icon wears `local` ms into its cycle ('' = the resting filter). */
function stageAt(local) {
  if (!(local >= STAGES[0][0])) return '';
  let value = '';
  for (const [at, filter] of STAGES) { if (at <= local) value = filter; else break; }
  return value;
}

/**
 * The move: the liquid stretches downward from its top edge (scale about the centre plus half the growth as a
 * translation), is gone, then the glass arrives from a little large and a little high and settles without overshoot.
 * `scale` and `translate` are the individual transform properties, so an icon's own `transform` rules keep working.
 */
function moveFrames() {
  const at = (ms) => ms / CYCLE;
  return [
    { offset: 0, opacity: 1, scale: '1 1', translate: '0 0', transformOrigin: '50% 50%', easing: EASE_IN },
    { offset: at(VANISH_AT), opacity: 0.94, scale: '0.95 1.3', translate: '0 15%', easing: EASE_IN_SOFT },
    { offset: at(GONE_AT), opacity: 0, scale: '0.9 1.5', translate: '0 31%', easing: 'linear' },
    { offset: at(RETURN_AT), opacity: 0, scale: '1.24 1.24', translate: '0 -7%', easing: EXPO_OUT },
    { offset: at(SETTLE_AT), opacity: 1, scale: '1 1', translate: '0 0', easing: 'linear' },
    { offset: 1, opacity: 1, scale: '1 1', translate: '0 0', transformOrigin: '50% 50%' },
  ];
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const root = () => document.documentElement;
const mq = (query) => { try { return window.matchMedia(query); } catch { return null; } };
let reducedMQ = null;
let forcedMQ = null;
let printMQ = null;

let started = false;
let defs = null;
let defsRtl = null;
let io = null;
let mo = null;
let STAGES = null;
let MOVE_FRAMES = null;
let ticking = false;
let lastBeat = -1;
let cap = MAX_ACTIVE;               // icons the next wave may take (lowered after a wave that ran slowly)
let waveSeq = 0;
let lastWaveCount = 0;
let frameAt = 0;                    // frame times of the wave in progress, for the governor
let frameSum = 0;
let frameCount = 0;
let governed = false;               // true while an ambient wave runs: only those are judged

const known = new WeakMap();        // icon → { seen: the observer has reported it, played: it has had its entry cycle }
const inView = new Set();           // icons inside the window
const observed = new Set();         // icons the intersection observer holds (released again once removed from the page)
const running = new Map();          // icon → { move, delay, stage }
let waveAt = 0;                     // performance.now() at the start of the last route wave
let waveTotal = 0;                  // length of the last wave (ms)
let routeUntil = 0;                 // icons born in view before this join the route wave
let holdUntil = 0;
let ambientTimer = 0;
let pendingBorn = [];               // icons born in view during the route window, waiting for one batched start
let bornQueued = false;

function mode() {
  const value = root().getAttribute('data-iconfx');
  return value === 'off' || value === 'enter' ? value : 'cycle';
}

/** Motion allowed: not reduced (OS unless forced on, or the setting), not printing, not forced colours, tab visible. */
function allowed() {
  if (document.hidden || typeof Element.prototype.animate !== 'function') return false;
  if (mode() === 'off') return false;
  if ((forcedMQ && forcedMQ.matches) || (printMQ && printMQ.matches)) return false;
  const motion = root().getAttribute('data-motion') || '';
  if (motion === 'reduce' || motion === 'reduced') return false;
  if (motion === 'full') return true;
  return !(reducedMQ && reducedMQ.matches);
}

const isRtl = () => root().getAttribute('dir') === 'rtl';

/* ------------------------------------------------------------------ */
/* Definitions in the document                                          */
/* ------------------------------------------------------------------ */

function mountDefs() {
  const rtl = isRtl();
  if (defs && defs.isConnected && defsRtl === rtl) return;
  if (!defs) {
    defs = node('svg', { id: DEFS_ID, width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' }, [node('defs', {})]);
  }
  const holder = defs.firstChild;
  holder.textContent = '';
  for (const filter of buildFilters(rtl)) holder.appendChild(filter);
  defsRtl = rtl;
  if (!defs.isConnected) document.body.appendChild(defs);
  root().setAttribute('data-iconfx-glass', '');
}

/* ------------------------------------------------------------------ */
/* One cycle                                                            */
/* ------------------------------------------------------------------ */

/** True while the icon's control is hovered, focused or pressed: no cycle may start on it. */
function busy(icon) {
  const control = icon.closest(CONTROL);
  if (!control) return false;
  try { return control.matches(':hover, :focus-within, :active'); } catch { return false; }
}

function stop(icon) {
  const run = running.get(icon);
  if (!run) return;
  running.delete(icon);
  try { run.move.cancel(); } catch { /* already gone */ }
  if (run.stage) icon.style.removeProperty('filter');
}

function stopAll() {
  for (const icon of Array.from(running.keys())) stop(icon);
}

/**
 * Put every running icon on the filter stage its own clock asks for. The stages are plain style changes, not a
 * filter animation: an animated filter is applied by the compositor on every frame, a styled one is painted into the
 * icon's layer once per stage.
 */
function sync() {
  for (const [icon, run] of running) {
    const time = run.move.currentTime;
    const stage = typeof time === 'number' ? stageAt(time - run.delay) : '';
    if (stage === run.stage) continue;
    run.stage = stage;
    if (stage) icon.style.setProperty('filter', stage); else icon.style.removeProperty('filter');
  }
}

/**
 * One loop for all running icons. Stage changes are taken on a shared 50 ms beat, so the style, paint and
 * layer-list work they cause lands on one frame in three instead of on every frame.
 */
function tick(now) {
  if (!running.size) { ticking = false; govern(); return; }
  if (frameAt && now - frameAt < 250) { frameSum += now - frameAt; frameCount += 1; }
  frameAt = now;
  const beat = Math.floor(now / STAGE_BEAT);
  if (beat !== lastBeat) { lastBeat = beat; sync(); }
  requestAnimationFrame(tick);
}

/**
 * The governor: after an ambient wave whose frames were slow on this device, the next waves take fewer icons
 * (evenly spread over the screen, different ones each time); after a smooth one they may take more again.
 */
function govern() {
  if (governed && frameCount >= 45 && lastWaveCount > 0) {
    const mean = frameSum / frameCount;
    if (mean > SLOW_FRAME) cap = Math.max(MIN_WAVE, Math.round(Math.min(cap, lastWaveCount) * 0.6));
    else if (mean < FAST_FRAME) cap = Math.min(MAX_ACTIVE, cap + 6);
  }
  frameAt = 0; frameSum = 0; frameCount = 0;
}

/** Start one cycle after `delay` ms. Returns false when the icon is not eligible. */
function cycle(icon, delay, paused) {
  if (!icon.isConnected || running.has(icon) || running.size >= MAX_ACTIVE) return false;
  if (!paused && busy(icon)) return false;
  const timing = { duration: CYCLE, delay: Math.max(0, delay), fill: 'none', easing: 'linear' };
  let move = null;
  try { move = icon.animate(MOVE_FRAMES, timing); } catch { return false; }
  if (paused) move.pause();
  const run = { move, delay: timing.delay, stage: '' };
  running.set(icon, run);
  const state = known.get(icon);
  if (state) state.played = true;
  move.onfinish = () => { if (running.get(icon) === run) stop(icon); };
  if (!ticking) { ticking = true; requestAnimationFrame(tick); }
  return true;
}

/* ------------------------------------------------------------------ */
/* Waves                                                                */
/* ------------------------------------------------------------------ */

/** Delay of an icon in a wave: across the window from the reading start and down it, so the wave runs diagonally. */
function waveDelay(rect, rtl, vw, vh) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const across = Math.min(1, Math.max(0, (rtl ? vw - cx : cx) / vw));
  const down = Math.min(1, Math.max(0, cy / vh));
  return Math.round(WAVE_SPREAD * across + WAVE_ROW * down);
}

/** One wave over the icons in view. All rectangles are read in one pass before any animation starts. */
function wave(opts = {}) {
  if (!opts.force && !opts.allow && !allowed()) return { count: 0, total: 0 };
  mountDefs();
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const rtl = isRtl();
  const picked = [];
  for (const icon of inView) {
    if (!icon.isConnected || running.has(icon)) continue;
    const rect = icon.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue;
    picked.push([icon, waveDelay(rect, rtl, vw, vh)]);
  }
  picked.sort((a, b) => a[1] - b[1]);
  // More icons than this device takes at once: every n-th in wave order, shifted from wave to wave.
  const limit = opts.force ? MAX_ACTIVE : cap;
  const total = picked.length;
  const shift = waveSeq++;
  let count = 0;
  let last = 0;
  picked.forEach(([icon, delay], index) => {
    if (total > limit && Math.floor(((index + shift) * limit) / total) === Math.floor(((index + shift - 1) * limit) / total)) return;
    if (cycle(icon, delay, opts.paused === true)) { count += 1; last = Math.max(last, delay); }
  });
  // Only a wave on a quiet page is judged: a page that is opening or changing route is slow for its own reasons.
  governed = opts.govern === true && opts.paused !== true;
  lastWaveCount = count;
  waveAt = performance.now();
  waveTotal = count ? last + CYCLE : 0;
  api.duration = waveTotal || WAVE_SPREAD + WAVE_ROW + CYCLE;
  return { count, total: waveTotal };
}

function scheduleAmbient() {
  clearTimeout(ambientTimer);
  ambientTimer = 0;
  if (document.hidden || mode() !== 'cycle') return;
  const wait = AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN);
  ambientTimer = setTimeout(function fire() {
    const now = performance.now();
    if (now < holdUntil) { ambientTimer = setTimeout(fire, holdUntil - now + 50); return; }
    if (running.size === 0) wave({ govern: true });
    scheduleAmbient();
  }, wait);
}

function routeWave() {
  waveAt = performance.now();
  routeUntil = waveAt + ROUTE_WINDOW;
  // The new page's icons are in the document now; the observer reports them within a frame or two.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (mode() === 'off') return;
    wave();
    scheduleAmbient();
  }));
}

/* ------------------------------------------------------------------ */
/* Icons entering the window                                            */
/* ------------------------------------------------------------------ */

function flushBorn() {
  bornQueued = false;
  const list = pendingBorn;
  pendingBorn = [];
  if (!allowed()) return;
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const rtl = isRtl();
  const elapsed = performance.now() - waveAt;
  // The same limit as a wave: what is still free of it, spread evenly over the newcomers.
  const fresh = list.filter(([icon]) => icon.isConnected && !running.has(icon));
  const room = Math.max(0, cap - running.size);
  const total = fresh.length;
  fresh.forEach(([icon, rect], index) => {
    if (total > room && Math.floor((index * room) / total) === Math.floor(((index - 1) * room) / total)) return;
    cycle(icon, Math.max(0, waveDelay(rect, rtl, vw, vh) - elapsed), false);
  });
  governed = false;
}

function onIntersect(entries) {
  const now = performance.now();
  const scrolled = [];
  for (const entry of entries) {
    const icon = entry.target;
    let state = known.get(icon);
    if (!state) { state = { seen: false, played: false }; known.set(icon, state); }
    const first = !state.seen;
    state.seen = true;
    if (entry.isIntersecting) {
      inView.add(icon);
      if (state.played) continue;
      if (first) {
        // Born inside the window: part of the page's opening wave while the route window is open, otherwise it
        // simply rests (a row re-rendered by live data must not melt every few seconds).
        if (now < routeUntil) pendingBorn.push([icon, entry.boundingClientRect]);
        else state.played = true;
      } else scrolled.push([icon, entry.boundingClientRect]);
    } else {
      inView.delete(icon);
      if (running.has(icon)) stop(icon);
    }
  }
  if (pendingBorn.length && !bornQueued) { bornQueued = true; requestAnimationFrame(flushBorn); }
  if (scrolled.length && allowed()) {
    const rtl = isRtl();
    scrolled.sort((a, b) => (a[1].top - b[1].top) || (rtl ? b[1].left - a[1].left : a[1].left - b[1].left));
    scrolled.forEach(([icon], index) => cycle(icon, Math.min(600, index * 45), false));
  }
}

function watch(scope) {
  if (!io || !scope) return;
  if (scope.nodeType !== 1) return;
  if (scope.matches && scope.matches(ICON)) { io.observe(scope); observed.add(scope); }
  if (scope.querySelectorAll) for (const icon of scope.querySelectorAll(ICON)) { io.observe(icon); observed.add(icon); }
}

function onMutations(records) {
  let removed = false;
  for (const record of records) {
    if (record.type === 'attributes') { onRootChange(record.attributeName); continue; }
    for (const added of record.addedNodes) if (added.nodeType === 1 && added !== defs) watch(added);
    if (record.removedNodes.length) removed = true;
  }
  // Release what left the page: a route change removes its icons, and the observer and the window set would
  // otherwise keep them (and their subtrees) alive for the whole session.
  if (removed) {
    for (const icon of Array.from(observed)) {
      if (icon.isConnected) continue;
      if (running.has(icon)) stop(icon);
      inView.delete(icon);
      observed.delete(icon);
      if (io) io.unobserve(icon);
    }
  }
}

function onRootChange(name) {
  if (name === 'dir') { stopAll(); mountDefs(); return; }
  if (!allowed()) stopAll();
  if (name === 'data-iconfx') scheduleAmbient();
}

/* ------------------------------------------------------------------ */
/* Reader input                                                         */
/* ------------------------------------------------------------------ */

/** Hover, focus or press on a control ends the cycles of its icons at once (they rest as glass). */
function settle(event) {
  if (!running.size) return;
  const target = event.target;
  const control = target && target.closest ? target.closest(CONTROL) : null;
  if (!control) return;
  for (const icon of Array.from(running.keys())) if (control.contains(icon)) stop(icon);
}

function hold() {
  holdUntil = performance.now() + HOLD_MS;
}

/* ------------------------------------------------------------------ */
/* Captures                                                             */
/* ------------------------------------------------------------------ */

const api = {
  /** One icon's cycle (ms). */
  cycle: CYCLE,
  /** The last wave, from the first icon's start to the last icon's end (ms). */
  duration: WAVE_SPREAD + WAVE_ROW + CYCLE,
  /** Start a wave over the icons in view; { paused: true } leaves it at 0 for seek(). */
  play(opts = {}) {
    stopAll();
    return wave({ paused: opts.paused === true, force: opts.governed !== true, allow: true, govern: opts.governed === true });
  },
  /** Icons the next wave may take on this device (the governor's current answer). */
  limit() { return cap; },
  /** Pause every running cycle at `ms` of the wave; { local: true } puts every icon at `ms` of its own cycle. */
  seek(ms, opts = {}) {
    governed = false;
    for (const run of running.values()) {
      run.move.pause();
      run.move.currentTime = Math.max(0, Number(ms) || 0) + (opts.local ? run.delay : 0);
    }
    sync();
    return running.size;
  },
  delayOf(icon) { const run = running.get(icon); return run ? run.delay : null; },
  /** Icons with a cycle scheduled or running; midCycle(): those past their delay, i.e. visibly animating now. */
  active() { return running.size; },
  midCycle() {
    let n = 0;
    for (const run of running.values()) { const t = run.move.currentTime; if (typeof t === 'number' && t >= run.delay && t < run.delay + CYCLE) n += 1; }
    return n;
  },
  rest() { stopAll(); },
};

/* ------------------------------------------------------------------ */
/* Start                                                                */
/* ------------------------------------------------------------------ */

/**
 * Start the effect (idempotent). `bus` is the app bus: a route change plays the page's opening wave.
 * @param {{ bus?: { on: Function } }} [opts]
 */
export function initIconFx(opts = {}) {
  if (started || typeof document === 'undefined' || typeof IntersectionObserver !== 'function' || typeof MutationObserver !== 'function') return api;
  started = true;
  reducedMQ = mq('(prefers-reduced-motion: reduce)');
  forcedMQ = mq('(forced-colors: active)');
  printMQ = mq('print');
  STAGES = stageTable();
  MOVE_FRAMES = moveFrames();
  mountDefs();

  io = new IntersectionObserver(onIntersect, { threshold: 0 });
  mo = new MutationObserver(onMutations);
  mo.observe(document.body, { childList: true, subtree: true });
  mo.observe(root(), { attributes: true, attributeFilter: ['dir', 'data-iconfx', 'data-motion'] });
  routeUntil = performance.now() + ROUTE_WINDOW;
  waveAt = performance.now();
  watch(document.body);

  document.addEventListener('pointerover', settle, { capture: true, passive: true });
  document.addEventListener('focusin', settle, { capture: true, passive: true });
  document.addEventListener('pointerdown', (event) => { hold(); settle(event); }, { capture: true, passive: true });
  document.addEventListener('keydown', hold, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAll(); clearTimeout(ambientTimer); ambientTimer = 0; } else scheduleAmbient(); });
  window.addEventListener('beforeprint', stopAll);
  const onPref = () => { if (!allowed()) stopAll(); };
  for (const query of [reducedMQ, forcedMQ]) if (query && typeof query.addEventListener === 'function') query.addEventListener('change', onPref);

  const bus = opts && opts.bus;
  if (bus && typeof bus.on === 'function') bus.on('route:change', routeWave);
  scheduleAmbient();
  try { window.__iconFx = api; } catch { /* frozen window */ }
  return api;
}

export const iconFx = api;
