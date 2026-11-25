/**
 * BILTIX Risk AI — AI risk register page strings (namespace 'airisks'). Owner: B-REGISTER.
 * Shared drawer / register / form strings live in js/i18n/risk.js (namespace 'risk').
 */
export default {
  ar: {
    title: 'سجل المخاطر الذكي',
    lead: 'كل مخاطرة رصدها محرك الذكاء الاصطناعي أو سُجّلت يدوياً، مع شدتها (الاحتمالية × الأثر) وثقة النموذج وجودة بيانات الإدخال كمفاهيم منفصلة. افتح أي صف لمراجعة الدليل واتخاذ القرار ومتابعة المعالجة حتى الإغلاق.',
    register: 'تسجيل مخاطرة',
    tasks: 'مهام المعالجة',
    summaryAria: 'ملخص المخاطر ضمن المشروع والفترة المحددين',
    sum: {
      open: 'مخاطر مفتوحة',
      openHint: 'عرض كل المخاطر',
      critical: 'حرجة (أحمر)',
      criticalHint: 'الدرجة {score} فأكثر — تصفية السجل',
      overdue: 'متأخرة عن الاستحقاق',
      overdueHint: 'مفتوحة وتجاوزت تاريخها — تصفية السجل',
      treatment: 'قيد المعالجة',
      treatmentHint: 'لها معالجة جارية — تصفية السجل',
    },
    domains: {
      title: 'المخاطر المفتوحة حسب المجال',
      sub: 'العدد الكلي والحرجة منها — اختر مجالاً لتصفية السجل',
      red: 'منها {count} حرجة',
      aria: '{domain}: {count} مخاطرة مفتوحة، {red} حرجة — تصفية السجل',
      empty: 'لا توجد مخاطر مفتوحة في هذا النطاق.',
    },
    dq: {
      title: 'جودة بيانات الإدخال للمخاطر المفتوحة',
      sub: 'مدى موثوقية بيانات المصدر — مستقلة عن الشدة وثقة النموذج',
      none: 'غير مُتحقق منها',
      note: 'المخاطر ذات جودة بيانات منخفضة تحتاج تحققاً من المصدر قبل اعتماد قرار المعالجة.',
      empty: 'لا توجد مخاطر مفتوحة في هذا النطاق.',
      share: '{pct} من المفتوحة',
      openDq: 'فتح جودة البيانات',
    },
  },
  en: {
    title: 'AI risk register',
    lead: 'Every risk the AI engine detected or that was registered manually, with its severity (likelihood × impact), model confidence and input-data quality shown as separate measures. Open any row to review the evidence, decide, and follow the treatment through to closure.',
    register: 'Register risk',
    tasks: 'Mitigation tasks',
    summaryAria: 'Risk summary for the selected project and period',
    sum: {
      open: 'Open risks',
      openHint: 'Show every risk',
      critical: 'Critical (red)',
      criticalHint: 'Score {score} or above — filter the register',
      overdue: 'Past due date',
      overdueHint: 'Open and past their date — filter the register',
      treatment: 'In treatment',
      treatmentHint: 'Treatment under way — filter the register',
    },
    domains: {
      title: 'Open risks by domain',
      sub: 'Total and critical — choose a domain to filter the register',
      red: '{count} critical',
      aria: '{domain}: {count} open risks, {red} critical — filter the register',
      empty: 'There are no open risks in this scope.',
    },
    dq: {
      title: 'Input data quality of open risks',
      sub: 'How reliable the source data is — separate from severity and model confidence',
      none: 'Not validated',
      note: 'Risks with low data quality need their source checked before a treatment decision is relied on.',
      empty: 'There are no open risks in this scope.',
      share: '{pct} of open',
      openDq: 'Open data quality',
    },
  },
};
