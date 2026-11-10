/**
 * Storyboard — the single source of truth for timing and on-screen copy.
 * Imported by the compositions (Remotion/webpack) and by
 * scripts/write-captions.mjs (Node type-stripping), so the WebVTT cues always
 * match what is rendered. Keep this file free of imports and non-erasable TS.
 */

export type Lang = 'ar' | 'en';
export type SceneId = 'intro' | 'source' | 'validate' | 'analyze' | 'explain' | 'approve' | 'mitigate' | 'close' | 'outro';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Cross-fade overlap between consecutive scenes (frames). */
export const TRANSITION = 15;

/** Scene order and length in frames. `step` = index on the 7-beat rail (null = intro/outro). */
export const SCENES: ReadonlyArray<{ id: SceneId; frames: number; step: number | null }> = [
  { id: 'intro', frames: 75, step: null },
  { id: 'source', frames: 135, step: 0 },
  { id: 'validate', frames: 135, step: 1 },
  { id: 'analyze', frames: 180, step: 2 },
  { id: 'explain', frames: 180, step: 3 },
  { id: 'approve', frames: 150, step: 4 },
  { id: 'mitigate', frames: 135, step: 5 },
  { id: 'close', frames: 165, step: 6 },
  { id: 'outro', frames: 75, step: null },
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

/** The seven story beats, as shown on the step rail. */
export const STEPS: Record<Lang, string[]> = {
  ar: ['مصدر البيانات', 'التحقق', 'تحليل المخاطر', 'التفسير', 'اعتماد بشري', 'المعالجة', 'إغلاق موثّق'],
  en: ['Data source', 'Validation', 'Risk analysis', 'Explanation', 'Human approval', 'Mitigation', 'Verified closure'],
};

/**
 * One caption per scene, ≤ 9 words each. `{sources}` is filled from
 * data.json (validation.sources) by fillCaption(), in the video and the VTT.
 */
export const CAPTIONS: Record<Lang, Record<SceneId, string>> = {
  ar: {
    intro: 'من البيانات الخام إلى إغلاق موثّق',
    source: '{sources} مصدراً تغذّي المنصة بالبيانات يومياً',
    validate: 'كل سجل يُتحقَّق منه قبل التحليل',
    analyze: 'الذكاء الاصطناعي يقيّم المخاطر عبر خمس فئات',
    explain: 'كل درجة مدعومة بتفسير ودليل من المصدر',
    approve: 'القرار للمراجع البشري، لا للنموذج',
    mitigate: 'التوصية المعتمدة تصبح مهمة معالجة متتبَّعة',
    close: 'سجل تدقيق كامل حتى الإغلاق الموثّق',
    outro: 'قرارات مدعومة بالدليل، بإشراف بشري',
  },
  en: {
    intro: 'From raw data to verified closure',
    source: '{sources} sources feed the platform every day',
    validate: 'Every record is validated before analysis',
    analyze: 'AI scores risk across five categories',
    explain: 'Every score is explained, with source evidence',
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
 * cross-fade into its scene is mostly done and ends just after the next scene
 * starts, so consecutive cues never overlap (6-frame gap).
 */
export function captionCues(): Array<{ id: SceneId; from: number; to: number }> {
  const out: Array<{ id: SceneId; from: number; to: number }> = [];
  let f = 0;
  SCENES.forEach((s, i) => {
    const last = i === SCENES.length - 1;
    const from = f + (s.id === 'intro' ? 18 : 10);
    const to = last ? f + s.frames - 6 : f + s.frames + 4;
    out.push({ id: s.id, from, to });
    f += s.frames;
  });
  return out;
}
