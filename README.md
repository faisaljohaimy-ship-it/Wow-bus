# Neexios — neexios.com

منصة ذكية لحجز رحلات الباصات | A smart bus booking platform.

## نظرة عامة | Overview

موقع Neexios هو واجهة ويب حديثة ثنائية اللغة (عربي RTL / English LTR) لمنصة حجز رحلات الباصات، مبني بتقنيات ويب خالصة بدون أي أدوات بناء — جاهز للنشر مباشرة على أي استضافة ثابتة.

A modern, bilingual (Arabic-first RTL / English LTR) website for the Neexios bus booking platform. Built with pure HTML/CSS/JS — no build tools required, deployable to any static host.

## المميزات | Features

- 🌐 **ثنائي اللغة** — تبديل فوري بين العربية والإنجليزية مع حفظ التفضيل
- 📱 **متجاوب بالكامل** — تصميم يعمل على الجوال والتابلت وسطح المكتب
- 🎨 **تصميم عصري** — هوية بصرية كاملة مع حركات سلسة تحترم `prefers-reduced-motion`
- 🔍 **نموذج بحث عن الرحلات** — مع تحقق من صحة المدخلات
- ⚡ **أداء عالي** — بدون مكتبات خارجية، ملفات خفيفة
- ♿ **إتاحة** — عناوين دلالية، تسميات ARIA، تباين ألوان جيد

## هيكل المشروع | Structure

```
├── index.html          # الصفحة الرئيسية (single page)
├── css/style.css       # نظام التصميم الكامل
├── js/main.js          # التفاعلية والترجمة (i18n)
└── assets/favicon.svg  # أيقونة الموقع
```

## التشغيل محلياً | Run locally

```bash
# أي خادم ثابت يكفي، مثلاً:
python3 -m http.server 8000
# ثم افتح http://localhost:8000
```

## النشر | Deployment

الموقع ثابت بالكامل ويمكن نشره على GitHub Pages أو Netlify أو Vercel أو Cloudflare Pages بربط المستودع مباشرة — لا حاجة لأي خطوة بناء.
