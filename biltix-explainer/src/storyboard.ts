/**
 * Storyboard — the single source of truth for timing and on-screen copy.
 * Imported by the compositions (Remotion/webpack) and by
 * scripts/write-captions.mjs (Node type-stripping), so the WebVTT cues always
 * match what is rendered. Keep this file free of imports and non-erasable TS.
 */

export type Lang = 'ar' | 'en';
export type SceneId = 'intro' | 'source' | 'validate' | 'analyze' | 'explain' | 'sitecam' | 'approve' | 'mitigate' | 'close' | 'outro';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Cross-dissolve overlap between consecutive scenes (frames). */
export const TRANSITION = 15;

/**
 * Scene order and length in frames. `step` = index on the 7-beat dial (null = intro/outro).
 * `cut` = the scene enters on a hard cut (the site-camera moment) instead of a dissolve.
 * `match` = a matched hand-off: a full cross-dissolve while the shared shape (emblem, ring, seal)
 * holds its screen spot. Every other entrance dips briefly through the canvas, so two text-heavy
 * layouts never sit on top of each other.
 */
export const SCENES: ReadonlyArray<{ id: SceneId; frames: number; step: number | null; cut?: boolean; match?: boolean }> = [
  { id: 'intro', frames: 72, step: null },
  { id: 'source', frames: 126, step: 0, match: true },
  { id: 'validate', frames: 126, step: 1 },
  { id: 'analyze', frames: 165, step: 2, match: true },
  { id: 'explain', frames: 156, step: 3 },
  { id: 'sitecam', frames: 90, step: 3, cut: true },
  { id: 'approve', frames: 138, step: 4 },
  { id: 'mitigate', frames: 132, step: 5 },
  { id: 'close', frames: 153, step: 6 },
  { id: 'outro', frames: 87, step: null, match: true },
];

export const TOTAL_FRAMES = SCENES.reduce((a, s) => a + s.frames, 0);

export function sceneStart(id: SceneId): number {
  let f = 0;
  for (const s of SCENES) {
    if (s.id === id) return f;
    f += s.frames;
  }
  throw new Error(`unknown scene ${id}`);
}

/** Frames a scene stays mounted: its own length plus the dissolve into the next one (none before a cut). */
export function sceneSpan(i: number): number {
  const s = SCENES[i];
  const next = SCENES[i + 1];
  return s.frames + (next && !next.cut ? TRANSITION : 0);
}

/** The seven story beats, as shown on the step dial. */
export const STEPS: Record<Lang, string[]> = {
  ar: ['مصدر البيانات', 'التحقق', 'تحليل المخاطر', 'التفسير', 'اعتماد بشري', 'المعالجة', 'إغلاق موثّق'],
  en: ['Data source', 'Validation', 'Risk analysis', 'Explanation', 'Human approval', 'Mitigation', 'Verified closure'],
};

/**
 * One caption per scene, ≤ 9 words each. `{sources}` is filled from
 * data.json (validation.sources) by fillCaption(), in the video and the VTT.
 * No caption claims a live connection: sources are demo feeds, the camera is simulated.
 */
export const CAPTIONS: Record<Lang, Record<SceneId, string>> = {
  ar: {
    intro: 'من البيانات الخام إلى إغلاق موثّق',
    source: '{sources} مصدراً للبيانات في مسار استيعاب واحد',
    validate: 'كل سجل يُتحقَّق منه قبل التحليل',
    analyze: 'الذكاء الاصطناعي يقيّم المخاطر عبر خمس فئات',
    explain: 'كل درجة مدعومة بتفسير ودليل من المصدر',
    sitecam: 'كاميرا موقع محاكاة تربط الدليل بمكانه',
    approve: 'القرار للمراجع البشري، لا للنموذج',
    mitigate: 'التوصية المعتمدة تصبح مهمة معالجة متتبَّعة',
    close: 'سجل تدقيق كامل حتى الإغلاق الموثّق',
    outro: 'قرارات مدعومة بالدليل، بإشراف بشري',
  },
  en: {
    intro: 'From raw data to verified closure',
    source: '{sources} data sources flow into one pipeline',
    validate: 'Every record is validated before analysis',
    analyze: 'AI scores risk across five categories',
    explain: 'Every score is explained, with source evidence',
    sitecam: 'A simulated site camera ties evidence to place',
    approve: 'A human reviewer makes the call',
    mitigate: 'Approved actions become tracked mitigation tasks',
    close: 'A full audit trail to verified closure',
    outro: 'Evidence-backed decisions, with humans in control',
  },
};

export function fillCaption(text: string, vars: { sources: number }): string {
  return text.replace('{sources}', String(vars.sources));
}

/** Caption fade length (frames). */
export const CAPTION_FADE = 8;

/**
 * Caption cue window per scene, in frames: [in, out). The cue starts once the
 * dissolve into its scene is mostly done and ends just after the next scene
 * starts, so consecutive cues never overlap (6-frame gap). After a hard cut the
 * cue comes in sooner: there is no dissolve to wait for.
 */
export function captionCues(): Array<{ id: SceneId; from: number; to: number }> {
  const out: Array<{ id: SceneId; from: number; to: number }> = [];
  let f = 0;
  SCENES.forEach((s, i) => {
    const last = i === SCENES.length - 1;
    const from = f + (s.id === 'intro' ? 18 : s.cut ? 8 : 10);
    const to = last ? f + s.frames - 6 : f + s.frames + (SCENES[i + 1].cut ? 0 : 4);
    out.push({ id: s.id, from, to });
    f += s.frames;
  });
  return out;
}
