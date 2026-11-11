/** Cockpit explainer hero (js/ui/explainer-hero.js) + its generated manifest (js/data/explainer-media.js). */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  autoplayDecision, shouldAutoplay, cueIndexAt, stepStarts, stepAt, formatClock, seekTarget,
  checkExplainerManifest, posterVariant, STEP_COUNT, POSTER_SIZES, STORAGE_KEYS,
} from '../js/ui/explainer-hero.js';
import EXPLAINER_DEFAULT, { EXPLAINER } from '../js/data/explainer-media.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDS = ['intro', 'source', 'validate', 'analyze', 'explain', 'sitecam', 'approve', 'mitigate', 'close', 'outro'];
const STEPS = [null, 0, 1, 2, 3, 3, 4, 5, 6, null];
const clone = (v) => JSON.parse(JSON.stringify(v));
const cuesEn = EXPLAINER.langs.en.cues;

/** VTT cue times and texts, parsed the plain way (one cue = id line, time line, text). */
function vtt(file) {
  return readFileSync(join(root, file), 'utf8').replace(/\r/g, '').split(/\n\n+/).slice(1).map((block) => {
    const lines = block.split('\n').filter(Boolean);
    const i = lines.findIndex((l) => l.includes('-->'));
    const sec = (ts) => { const [hh, mm, ss] = ts.trim().split(/\s+/)[0].split(':'); return Number(hh) * 3600 + Number(mm) * 60 + Number(ss); };
    const [a, b] = lines[i].split('-->');
    return { start: sec(a), end: sec(b), text: lines.slice(i + 1).join(' ').trim() };
  });
}

export const tests = [
  {
    name: 'manifest: exact shape (build, ar + en, files, size, duration, voice null|{name,provider,model}, 10 cues in storyboard order)',
    fn() {
      assert.equal(EXPLAINER_DEFAULT, EXPLAINER, 'default export is the same object');
      assert.ok(Object.isFrozen(EXPLAINER), 'top level frozen');
      assert.deepEqual(Object.keys(EXPLAINER), ['build', 'langs']);
      assert.match(EXPLAINER.build, /^\d{4}-\d{2}-\d{2}$/);
      assert.deepEqual(Object.keys(EXPLAINER.langs).sort(), ['ar', 'en']);
      for (const lang of ['ar', 'en']) {
        const e = EXPLAINER.langs[lang];
        assert.deepEqual(Object.keys(e), ['mp4', 'poster', 'vtt', 'width', 'height', 'duration', 'voice', 'cues'], `${lang} keys in order`);
        assert.equal(e.mp4, `assets/video/explainer-${lang}-720p.mp4`);
        assert.equal(e.poster, `assets/video/explainer-${lang}-poster.webp`);
        assert.equal(e.vtt, `assets/video/explainer-${lang}.vtt`);
        assert.ok(e.voice === null || (typeof e.voice.name === 'string' && typeof e.voice.provider === 'string' && typeof e.voice.model === 'string'));
        assert.deepEqual(e.cues.map((c) => c.id), IDS);
        assert.deepEqual(e.cues.map((c) => c.step), STEPS, 'step = the 7-beat index from the storyboard');
        e.cues.forEach((c) => assert.deepEqual(Object.keys(c), ['id', 'start', 'end', 'step', 'text']));
      }
      const r = checkExplainerManifest(EXPLAINER);
      assert.deepEqual(r.errors, []);
      assert.equal(r.ok, true);
    },
  },
  {
    name: 'manifest: cue times and texts equal the WebVTT files; {sources} is filled (13); the files exist',
    fn() {
      for (const lang of ['ar', 'en']) {
        const e = EXPLAINER.langs[lang];
        const v = vtt(e.vtt);
        assert.equal(v.length, 10);
        v.forEach((c, i) => {
          assert.ok(Math.abs(c.start - e.cues[i].start) < 0.0015, `${lang} ${IDS[i]} start`);
          assert.ok(Math.abs(c.end - e.cues[i].end) < 0.0015, `${lang} ${IDS[i]} end`);
          assert.equal(e.cues[i].text, c.text, `${lang} ${IDS[i]} text`);
        });
        assert.ok(e.cues[1].text.includes('13'), 'sources count filled in');
        assert.ok(!/\{\w+\}/.test(e.cues.map((c) => c.text).join(' ')));
        for (const f of [e.mp4, e.poster, e.vtt, posterVariant(e.poster)]) assert.ok(existsSync(join(root, f)), `${f} exists`);
        assert.ok(e.cues[e.cues.length - 1].end <= e.duration);
      }
    },
  },
  {
    name: 'manifest check: catches missing files, a broken voice, wrong cue order, overlaps, unfilled text, a step without a cue',
    fn() {
      const bad = clone(EXPLAINER);
      bad.langs.ar.mp4 = '';
      bad.langs.ar.voice = { name: 'X' };
      bad.langs.en.cues = bad.langs.en.cues.slice().reverse();
      let r = checkExplainerManifest(bad);
      assert.equal(r.ok, false);
      assert.ok(r.errors.some((e) => e === 'ar: mp4 missing'));
      assert.ok(r.errors.some((e) => e.startsWith('ar: voice')));
      assert.ok(r.errors.some((e) => e.startsWith('en: cue 0 id')));
      const b2 = clone(EXPLAINER);
      b2.langs.en.cues[3].start = 1;            // starts before the previous cue ended
      b2.langs.en.cues[4].text = '{sources} x';
      b2.langs.en.cues[9].end = 99;
      r = checkExplainerManifest(b2);
      assert.ok(r.errors.includes('en: cue analyze overlaps the previous cue'));
      assert.ok(r.errors.includes('en: cue explain text missing or unfilled'));
      assert.ok(r.errors.includes('en: cue outro ends after the video'));
      const b3 = clone(EXPLAINER);
      b3.langs.ar.cues[7].step = 4;             // step 5 (mitigation) loses its only cue
      assert.ok(checkExplainerManifest(b3).errors.includes('ar: not every step has a cue'));
      const voiced = clone(EXPLAINER);
      voiced.langs.ar.voice = { name: 'Narrator', provider: 'Provider', model: 'model-1' };
      assert.equal(checkExplainerManifest(voiced).ok, true, 'a narrated entry is valid');
      assert.equal(checkExplainerManifest(null).ok, false);
      assert.deepEqual(checkExplainerManifest({ build: 'x' }).errors, ['langs missing']);
    },
  },
  {
    name: 'autoplay policy: plays by default; reduced motion, the motion setting, Save-Data, a collapsed hero and a finished viewing say no',
    fn() {
      assert.deepEqual(autoplayDecision({}), { autoplay: true, reason: null });
      assert.deepEqual(autoplayDecision({ reducedMotion: true }), { autoplay: false, reason: 'reduced-motion' });
      assert.deepEqual(autoplayDecision({ motion: 'reduce' }), { autoplay: false, reason: 'motion-setting' });
      assert.deepEqual(autoplayDecision({ saveData: true }), { autoplay: false, reason: 'save-data' });
      assert.deepEqual(autoplayDecision({ collapsed: true }), { autoplay: false, reason: 'collapsed' });
      assert.deepEqual(autoplayDecision({ finished: true }), { autoplay: false, reason: 'finished' });
      // settings.motion 'full' overrides the OS preference (the app-wide rule), but never Save-Data or the reader's choices
      assert.equal(shouldAutoplay({ reducedMotion: true, motion: 'full' }), true);
      assert.equal(shouldAutoplay({ reducedMotion: true, motion: 'full', saveData: true }), false);
      assert.equal(shouldAutoplay({ motion: 'full', collapsed: true }), false);
      assert.equal(shouldAutoplay({ motion: 'auto', finished: true }), false);
      // precedence: the reader's collapse is reported first
      assert.equal(autoplayDecision({ collapsed: true, reducedMotion: true, saveData: true }).reason, 'collapsed');
      assert.equal(shouldAutoplay(), true);
    },
  },
  {
    name: 'cue index at time: last started cue, gaps keep the previous line, -1 before the first cue, last cue after the end',
    fn() {
      assert.equal(cueIndexAt(cuesEn, 0), -1);
      assert.equal(cueIndexAt(cuesEn, 0.599), 0, '1 ms tolerance at a boundary');
      assert.equal(cueIndexAt(cuesEn, 0.6), 0);
      assert.equal(cueIndexAt(cuesEn, 2.6), 0, 'gap between intro and source');
      assert.equal(cueIndexAt(cuesEn, 2.733), 1);
      assert.equal(cueIndexAt(cuesEn, 12), 3);
      assert.equal(cueIndexAt(cuesEn, 22), 5, 'site camera');
      assert.equal(cueIndexAt(cuesEn, 41.5), 9);
      assert.equal(cueIndexAt(cuesEn, 500), 9);
      for (const bad of [NaN, Infinity, undefined, '3']) assert.equal(cueIndexAt(cuesEn, bad), -1);
      assert.equal(cueIndexAt([], 3), -1);
      assert.equal(cueIndexAt(null, 3), -1);
      // every cue's own start maps to itself
      cuesEn.forEach((c, i) => assert.equal(cueIndexAt(cuesEn, c.start), i));
    },
  },
  {
    name: 'steps: seven start marks from the cues; stepAt names intro / step / outro',
    fn() {
      const s = stepStarts(cuesEn);
      assert.equal(s.length, STEP_COUNT);
      assert.deepEqual(s, [2.733, 6.933, 11.133, 16.633, 24.833, 29.433, 33.833]);
      assert.deepEqual(stepAt(cuesEn, 0.2), { index: -1, step: null, phase: 'intro' });
      assert.deepEqual(stepAt(cuesEn, 1), { index: 0, step: null, phase: 'intro' });
      assert.deepEqual(stepAt(cuesEn, 22), { index: 5, step: 3, phase: 'step' });
      assert.deepEqual(stepAt(cuesEn, 40), { index: 9, step: null, phase: 'outro' });
    },
  },
  {
    name: 'formatClock and keyboard seeking (5 s arrows, step jumps on PageUp/PageDown, Home/End, clamped)',
    fn() {
      assert.equal(formatClock(0), '0:00');
      assert.equal(formatClock(41.5), '0:41');
      assert.equal(formatClock(61), '1:01');
      assert.equal(formatClock(-3), '0:00');
      assert.equal(formatClock(NaN), '0:00');
      const o = { time: 12, duration: 41.5, starts: stepStarts(cuesEn) };
      assert.equal(seekTarget('ArrowRight', o), 17);
      assert.equal(seekTarget('ArrowUp', o), 17);
      assert.equal(seekTarget('ArrowLeft', o), 7);
      assert.equal(seekTarget('ArrowDown', o), 7);
      assert.equal(seekTarget('ArrowLeft', { ...o, time: 2 }), 0);
      assert.equal(seekTarget('ArrowRight', { ...o, time: 40 }), 41.5);
      assert.equal(seekTarget('Home', o), 0);
      assert.equal(seekTarget('End', o), 41.5);
      assert.equal(seekTarget('PageUp', o), 16.633, 'next step');
      assert.equal(seekTarget('PageDown', o), 6.933, '12 s is 0.9 s into step 3: back to step 2');
      assert.equal(seekTarget('PageDown', { ...o, time: 14 }), 11.133, 'back to the start of the current step');
      assert.equal(seekTarget('PageUp', { ...o, time: 35 }), 41.5, 'after the last step: the end');
      assert.equal(seekTarget('PageDown', { ...o, time: 1 }), 0);
      assert.equal(seekTarget('Enter', o), null);
      assert.equal(seekTarget('a', o), null);
      assert.equal(seekTarget('ArrowRight', { time: 3, duration: 0 }), 0, 'unknown duration clamps to 0');
    },
  },
  {
    name: 'index.html poster preload matches the component (same sizes, srcset widths and minimise key) so it is reused',
    fn() {
      const html = readFileSync(join(root, 'index.html'), 'utf8');
      assert.ok(html.includes(`pre.setAttribute('imagesizes', '${POSTER_SIZES}')`), 'imagesizes = POSTER_SIZES');
      assert.ok(html.includes("base + '-640.webp 640w, ' + base + '.webp 1280w'"), 'same srcset candidates');
      assert.ok(html.includes(`localStorage.getItem('${STORAGE_KEYS.collapsed}')`), 'skipped when minimised');
      for (const lang of ['ar', 'en']) assert.equal(`assets/video/explainer-${lang}-poster.webp`, EXPLAINER.langs[lang].poster, 'preload base follows the manifest naming');
    },
  },
  {
    name: 'poster variant: the 640 px file sits next to the 1280 px poster',
    fn() {
      assert.equal(posterVariant('assets/video/explainer-ar-poster.webp'), 'assets/video/explainer-ar-poster-640.webp');
      assert.equal(posterVariant('x.jpg'), null);
      assert.equal(posterVariant(null), null);
    },
  },
];
