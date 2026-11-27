// Dependency-free browser runtime for hub motion specifications (schema_version 1).
// It plays the same JSON the Python compiler turns into CSS, through the Web Animations
// API, and adds the behaviours a stylesheet cannot express: stagger, grapheme-safe
// typewriter text and number counters. Every animated value is a pure function of time,
// so a scene can be seeked frame by frame for deterministic rendering.

const EASINGS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};
const PROPERTIES = ['opacity', 'transform', 'filter', 'color', 'background-color'];
const SAFE_ID = /^[a-z][a-z0-9-]{1,63}$/;

const fail = (message) => {
  throw new Error(message);
};

/** Same acceptance rules as motion-library/compiler.py. Returns the spec or throws. */
export function validateSpec(spec) {
  if (!spec || spec.schema_version !== 1) fail('Unsupported schema version');
  if (typeof spec.id !== 'string' || !SAFE_ID.test(spec.id)) fail('Invalid motion id');
  if (!Number.isInteger(spec.duration_ms) || spec.duration_ms <= 0 || spec.duration_ms > 10000) {
    fail('duration_ms must be an integer from 1 to 10000');
  }
  if (!Object.hasOwn(EASINGS, spec.easing)) fail('Unsupported easing');
  const frames = spec.keyframes;
  if (!Array.isArray(frames) || frames.length < 2) fail('At least two keyframes are required');
  const offsets = frames.map((frame) => {
    if (typeof frame.offset !== 'number' || !(frame.offset >= 0 && frame.offset <= 1)) {
      fail('Keyframe offsets must be between 0 and 1');
    }
    const names = Object.keys(frame).filter((name) => name !== 'offset');
    if (!names.length || !names.every((name) => PROPERTIES.includes(name))) {
      fail('Unsupported or empty keyframe properties');
    }
    names.forEach((name) => safeValue(frame[name]));
    return frame.offset;
  });
  const ordered = offsets.every((offset, index) => index === 0 || offsets[index - 1] <= offset);
  if (!ordered || offsets[0] !== 0 || offsets.at(-1) !== 1) fail('Keyframes must be ordered from offset 0 to 1');
  const reduced = spec.reduced_motion;
  const reducedNames = reduced && typeof reduced === 'object' ? Object.keys(reduced) : [];
  if (!reducedNames.length || !reducedNames.every((name) => PROPERTIES.includes(name))) {
    fail('A safe reduced_motion state is required');
  }
  reducedNames.forEach((name) => safeValue(reduced[name]));
  return spec;
}

function safeValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number') fail('Property values must be strings or numbers');
  if (/[;{}]/.test(String(value))) fail('Unsafe CSS value');
  return String(value);
}

/** CSS cubic-bezier timing function as progress in, eased progress out. */
export function cubicBezier(x1, y1, x2, y2) {
  const coordinate = (a, b, t) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  const slope = (a, b, t) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
  return (progress) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = progress;
    for (let step = 0; step < 32; step += 1) {
      const error = coordinate(x1, x2, t) - progress;
      if (Math.abs(error) < 1e-9) break;
      if (error > 0) high = t;
      else low = t;
      const gradient = slope(x1, x2, t);
      const next = gradient > 1e-6 ? t - error / gradient : (low + high) / 2;
      t = next > low && next < high ? next : (low + high) / 2;
    }
    return coordinate(y1, y2, t);
  };
}

const curves = new Map();

/** Eased progress for one of the five easing keywords a specification may name. */
export function ease(name, progress) {
  if (!Object.hasOwn(EASINGS, name)) fail('Unsupported easing');
  if (!curves.has(name)) curves.set(name, cubicBezier(...EASINGS[name]));
  return curves.get(name)(progress);
}

/**
 * Keyframes in the shape Element.animate() accepts. The easing is attached to every
 * keyframe because CSS applies animation-timing-function to each interval between
 * keyframes, not once across the whole animation; this keeps both paths identical.
 */
export function toKeyframes(spec) {
  return spec.keyframes.map((frame) => {
    const keyframe = { offset: frame.offset, easing: spec.easing };
    for (const [name, value] of Object.entries(frame)) {
      if (name !== 'offset') keyframe[name === 'background-color' ? 'backgroundColor' : name] = String(value);
    }
    return keyframe;
  });
}

export function prefersReducedMotion(view = globalThis) {
  return Boolean(view && view.matchMedia && view.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Put an element in the specification's reduced-motion end state without animating. */
export function applyReducedState(element, spec) {
  for (const [name, value] of Object.entries(spec.reduced_motion)) element.style.setProperty(name, String(value));
}

/**
 * Play a specification on an element. Returns the Animation, or null when reduced
 * motion applies and the element was placed directly in its end state.
 */
export function play(element, spec, { delay = 0, reducedMotion } = {}) {
  validateSpec(spec);
  const reduce = reducedMotion ?? prefersReducedMotion(element.ownerDocument.defaultView);
  if (reduce) {
    applyReducedState(element, spec);
    return null;
  }
  return element.animate(toKeyframes(spec), { duration: spec.duration_ms, delay, easing: 'linear', fill: 'both' });
}

/** Start delay in milliseconds for each of `count` items. */
export function staggerDelays(count, each = 30, start = 0) {
  return Array.from({ length: count }, (_, index) => start + index * each);
}

/** Play one specification across a list, each item starting `each` ms after the previous. */
export function stagger(elements, spec, { each = 30, delay = 0, reducedMotion } = {}) {
  const items = Array.from(elements);
  const delays = staggerDelays(items.length, each, delay);
  return items.map((element, index) => play(element, spec, { delay: delays[index], reducedMotion }));
}

/** Pause animations and move them to one point in time: the basis of frame-exact rendering. */
export function seek(animations, timeMs) {
  for (const animation of animations) {
    if (!animation) continue;
    animation.pause();
    animation.currentTime = timeMs;
  }
}

/** User-perceived characters, so Arabic marks, ligatures and emoji are never split. */
export function graphemes(text, locale) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(String(text)), (part) => part.segment);
  }
  return Array.from(String(text));
}

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0));

/**
 * Units a typewriter reveals. Graphemes suit scripts whose letters stand alone; in
 * joined scripts such as Arabic a letter changes shape as its neighbours arrive, so
 * 'word' reveals whole words (with the spaces and punctuation between them).
 */
export function segments(text, locale, unit = 'grapheme') {
  if (unit === 'word' && typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(locale, { granularity: 'word' }).segment(String(text)), (part) => part.segment);
  }
  return graphemes(text, locale);
}

/** The part of `text` visible at `progress` (0 to 1), cut only between units. */
export function typewriterAt(text, progress, locale, unit) {
  const parts = segments(text, locale, unit);
  return parts.slice(0, Math.round(clamp(progress) * parts.length)).join('');
}

/** Counter value at `progress` (0 to 1) between two numbers. */
export function counterValueAt(from, to, progress, easing = 'ease-out') {
  return from + (to - from) * ease(easing, clamp(progress));
}

export function formatCounter(value, { locale = 'en', maximumFractionDigits = 0 } = {}) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

/** Write the typewriter state for `progress` into an element. Screen readers get the full text. */
export function renderTypewriter(element, text, progress, locale, unit) {
  element.setAttribute('aria-label', String(text));
  element.textContent = typewriterAt(text, progress, locale, unit);
}

/** Write the counter state for `progress` into an element. */
export function renderCounter(element, from, to, progress, options = {}) {
  element.textContent = formatCounter(counterValueAt(from, to, progress, options.easing), options);
}

/**
 * Drive a render(progress) function over `duration` ms with requestAnimationFrame.
 * Under reduced motion the final state is rendered once. Returns a promise that
 * resolves when the last frame has been drawn.
 */
export function run(render, duration, { view = globalThis, reducedMotion } = {}) {
  if (reducedMotion ?? prefersReducedMotion(view)) {
    render(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let start;
    const frame = (now) => {
      start ??= now;
      const progress = clamp((now - start) / duration);
      render(progress);
      if (progress < 1) view.requestAnimationFrame(frame);
      else resolve();
    };
    view.requestAnimationFrame(frame);
  });
}
