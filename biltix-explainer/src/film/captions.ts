/**
 * Burned-in captions: the narration lines of public/v2/voice/narration-{ar,en}.txt, word for word, split into
 * chunks of at most two lines at 42 px ("|"). Subtitle conventions only: Arabic without the TTS short vowels
 * (shadda and the passive damma kept), and numbers in Western digits as in the app (e.g. «مئةٌ وعشرةُ أيام» → «110
 * أيام», "twenty-eight" → "28", «كيو آر» → «QR», «ثلاثمئة وستين درجة» → «360°»).
 * A chunk boundary is placed where the voice pauses nearest to the chunk's share of the line's characters.
 */
import type { Lang, SceneTiming } from './timeline';
import { FPS } from './timeline';

const AR = [
  'في المشاريع الكبيرة، قد يوقف قرار واحد متأخّر سلسلة كاملة.|هذه قصّة مادّة واحدة… وكيف تمنع بلتكس أثرها قبل أن يصل إلى الموقع.',
  'في هذا المثال التوضيحي من بيانات المنصّة: برج الواجهة الماليّة في الرياض.|ألواح الواجهة الزجاجيّة جاهزة للتصنيع، لكنّ اعتماد الزجاج ما زال معلّقاً لدى الاستشاري.',
  'المراجعة الأولى عادت بالرمز C: أعد وقدّم.|والثانية معلّقة، بانتظار قرار صاحب العمل في تغيير الزجاج إلى ثلاثيّ الطبقات… منذ 16 يوماً.',
  'ولأنّ مدّة التوريد 110 أيام، فقد فات آخر موعد لإصدار أمر الشراء قبل 14 يوماً.|والمُصنّع يحجز خطّ الإنتاج حتى 24 نوفمبر فقط.',
  'النتيجة: نشاط تركيب الواجهات على المسار الحرج، بلا أيّ طفو، يتأخّر 28 يوماً…|و50 يوماً إن ضاع حجز الإنتاج.',
  'ومعه تعرّض ماليّ يقارب 25 مليون ريال، ويضيق تصريح إغلاق الطريق اللازم لرفع الألواح،|ويزداد ضغط الرفع الليلي والرافعات.',
  'صباح الثلاثاء، ربطت المنصّة الأدلّة من سبعة مصادر:|الاعتمادات، والمشتريات، وبريمافيرا، والعقود، والمراسلات، وتقارير الموقع، والطقس.',
  'ثمّ قيّمت المخاطرة: احتماليّة 4، وأثر 5، والدرجة 80 من 100… حمراء.|وشرحت السبب بلغة واضحة، مع كلّ دليل ومصدره.',
  'وقدّمت ثلاث توصيات بمزاياها ومخاطرها:|اجتماع عاجل لاعتماد مشروط، وتأهيل مورد بديل، وتقسيم التركيب إلى حزمتين.',
  'والقرار للإنسان. اعتمد مدير المشروع الأولى والثالثة، وأبقى المورد البديل احتياطاً،|وسجّل السبب… بشرط موافقة السلامة قبل أيّ رفع ليلي.',
  'تحوّل القرار إلى ستّ مهامّ بأصحابها ومواعيدها،|فانخفض التأخير المتوقّع من 28 يوماً… إلى 4 أيام.',
  'ولا تُغلق المخاطرة بالكلام، بل بالدليل: خطاب الاعتماد، وأمر الشراء، والجدول المعتمد،|واستلام الصناديق بمسح QR، ولقطة \u2066360°\u2069 لأوّل وحدة مركّبة.',
  'وهنا تبدأ خارطة التطوير، لتشغيل حقيقيّ في الموقع.',
  'أولاً: العمل دون اتصال. يسجّل المشرف في القبو بلا شبكة،|وتُزامن البيانات تلقائياً عند عودة الاتصال.',
  'ثانياً: رموز QR على الموادّ والمناطق والتصاريح، تربط كلّ ما في الموقع بسجلّه.|وثالثاً: المخطّطات المعتمدة، طبقةً أساسيّة للمناطق والرافعات والكاميرات.',
  'ورابعاً: كاميرات \u2066360°\u2069. جولات دوريّة تُطابق مع المخطّطات،|وكاميرات ثابتة بذكاء طرفيّ يرسل الأحداث لا الفيديو، مع حماية الخصوصيّة.',
  'ولتشغيلها فعلياً: ربط أنظمة الاعتمادات والمشتريات والجدول الزمني،|وشبكة وطاقة في الموقع، واستضافة داخل المملكة.',
  'بلتكس للمخاطر بالذكاء الاصطناعي.|قرارات مدعومة بالدليل… بإشراف بشري.',
];

const EN = [
  'On a large project, one late decision can stall a whole chain.|This is the story of one material… and how BILTIX stops its impact before it reaches the site.',
  "In this illustrative example from the platform's demo data: the Financial Gateway Tower in Riyadh.|The glass façade panels are ready to be made, but the glass approval is still stuck with the consultant.",
  'The first revision came back with code C: revise and resubmit.|The second is on hold, waiting for the employer to decide on triple glazing… for 16 days now.',
  'With a lead time of 110 days, the latest purchase-order date passed 14 days ago.|And the supplier holds its production slot only until 24 November.',
  'The result: façade installation, on the critical path with zero float, slips by 28 days…|and 50, if the production slot is lost.',
  'With it comes an exposure of about 25 million riyals, a tighter road-closure permit for lifting the panels,|and more pressure on night lifts and cranes.',
  'On Tuesday morning, the platform linked the evidence from seven sources:|approvals, procurement, Primavera, contracts, correspondence, site reports and weather.',
  'Then it scored the risk: likelihood 4, impact 5, a score of 80 out of 100… red.|And it explained why, in plain language, with every piece of evidence and its source.',
  'It proposed three options, each with its trade-offs: an urgent meeting for a conditional approval,|a pre-qualified alternative supplier, and splitting installation into two packages.',
  'The decision stays human. The project manager accepted the first and third, kept the alternative supplier as a hedge,|and recorded why… on condition that safety signs off before any night lift.',
  'The decision became six tasks, each with an owner and a date.|The forecast delay dropped from 28 days… to 4.',
  "And the risk doesn't close with words, but with evidence: the approval letter, the purchase order, the accepted programme,|crates received by QR scan, and a 360° capture of the first installed unit.",
  'This is where the development roadmap begins, for real operation on site.',
  'First: offline. A supervisor records in a basement with no signal,|and the data syncs automatically when the connection returns.',
  'Second: QR codes on materials, zones and permits, linking everything on site to its record.|Third: approved drawings as the base layer for zones, cranes and cameras.',
  'And fourth: 360° cameras. Regular walk-throughs matched to the drawings,|and fixed cameras with edge AI that send events, not video, with privacy protected.',
  'To run it for real: connect the approvals, procurement and scheduling systems,|bring network and power to site, and host the data inside the Kingdom.',
  'BILTIX Risk AI.|Evidence-backed decisions… with humans in control.',
];

export const CAPTION_LINES: Record<Lang, string[]> = { ar: AR, en: EN };

export type Chunk = { text: string; from: number; to: number }; // frames from the scene start

/** Chunks of line i, timed to the voice: boundaries snap to the nearest inner pause (± 1.4 s of the char share). */
export function captionChunks(lang: Lang, s: SceneTiming): Chunk[] {
  const parts = CAPTION_LINES[lang][s.index].split('|');
  const total = parts.reduce((a, p) => a + p.length, 0);
  const len = s.line.end - s.line.start;
  const pauses = s.line.pauses.map(([a, b]) => [a - s.line.start, b - s.line.start]);
  const bounds: number[] = [];
  let acc = 0;
  const used = new Set<number>();
  for (let k = 0; k < parts.length - 1; k += 1) {
    acc += parts[k].length;
    const est = (acc / total) * len;
    let best = -1;
    let bestScore = Infinity;
    pauses.forEach(([a, b], j) => {
      if (used.has(j)) return;
      const mid = (a + b) / 2;
      const score = Math.abs(mid - est) - 0.6 * (b - a);
      if (Math.abs(mid - est) < 1.4 && score < bestScore) { bestScore = score; best = j; }
    });
    if (best >= 0) { used.add(best); bounds.push(pauses[best][1] - 0.1); } else bounds.push(est);
  }
  const fr = (sec: number) => Math.round(s.vFrom + sec * FPS);
  return parts.map((text, k) => ({
    text,
    from: k === 0 ? s.vFrom - 4 : fr(bounds[k - 1]),
    to: k === parts.length - 1 ? s.vTo + 10 : fr(bounds[k]),
  }));
}
