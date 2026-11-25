/**
 * BILTIX Risk AI — go-live readiness strip strings (namespace 'golive': `status` and `strip`).
 *
 * The cockpit (the home route) shows one strip that links to #/golive. It registers this small file instead of the
 * whole go-live dictionary (js/i18n/golive.js, ~90 KB), which imports these two blocks so each string has one home.
 * The strip's accessible name is its visible text plus what `strip.aria` adds (components.setLabelInName).
 */
export default {
  ar: {
    status: {
      built_demo: 'مبني كعرض',
      ready_connect: 'جاهز للربط',
      needs_client: 'يحتاج مدخلات العميل',
      planned: 'مخطط',
    },
    strip: {
      label: 'الجاهزية للتشغيل',
      value: '{x} من {y} قدرة مبنية كعرض أو جاهزة للربط',
      cta: 'ما يلزم للتشغيل الفعلي ←',
      aria: 'الجاهزية للتشغيل: {x} من {y} قدرة مبنية كعرض أو جاهزة للربط. يفتح صفحة الجاهزية للتشغيل.',
      seg: '{label}: {n}',
    },
  },
  en: {
    status: {
      built_demo: 'Built as demo',
      ready_connect: 'Ready to connect',
      needs_client: 'Needs client input',
      planned: 'Planned',
    },
    strip: {
      label: 'Go-live readiness',
      value: '{x} of {y} capabilities built as a demo or ready to connect',
      cta: 'What a real go-live needs →',
      aria: 'Go-live readiness: {x} of {y} capabilities built as a demo or ready to connect. Opens the go-live readiness page.',
      seg: '{label}: {n}',
    },
  },
};
