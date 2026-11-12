/**
 * Bookend copy (the cinematic open and close around the MVP showcase film).
 * Arabic is written without tashkeel except the shadda the app itself uses; no letter-spacing is ever
 * applied to Arabic (it breaks the joining).
 */
export type Lang = 'ar' | 'en';

export const BOOK = {
  ar: {
    nameAr: 'بلتكس للمخاطر بالذكاء الاصطناعي',
    tagline: 'من الموقع… إلى القرار، بالدليل',
    closing: ['قرارات مدعومة بالدليل،', 'بإشراف بشري'],
    honest: 'لقطات توضيحية مولّدة بالذكاء الاصطناعي',
  },
  en: {
    nameAr: 'بلتكس للمخاطر بالذكاء الاصطناعي',
    tagline: 'From the site to the decision — with evidence',
    closing: ['Evidence-backed decisions,', 'with humans in control'],
    honest: 'AI-generated illustrative footage',
  },
} as const;

export const LINK = 'biltix-risk-ai.vercel.app';
