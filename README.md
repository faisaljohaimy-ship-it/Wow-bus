# Neexios — neexios.com

منصة ذكية لحجز رحلات الباصات | A smart bus booking platform.

هذا المستودع يحتوي جزأين | This repository contains two parts:

1. **موقع Neexios الثابت (في جذر المستودع)** — الموقع الرئيسي ولوحة التحكم والمساعدة الصوتية أريا، بتقنيات ويب خالصة بدون أدوات بناء
2. **تطبيق TanStack Start (في `src/`)** — هيكل تطبيق React (TanStack Router + Query + Tailwind)

---

## الجزء الأول: موقع Neexios الثابت | Static site

موقع ويب حديث ثنائي اللغة (عربي RTL / English LTR) لمنصة حجز رحلات الباصات — جاهز للنشر مباشرة على أي استضافة ثابتة.

### المميزات | Features

- 🌐 **ثنائي اللغة** — تبديل فوري بين العربية والإنجليزية مع حفظ التفضيل
- 📱 **متجاوب بالكامل** — تصميم يعمل على الجوال والتابلت وسطح المكتب
- 📊 **لوحة تحكم تشغيلية** (`dashboard.html`) — مؤشرات أداء ورسوم SVG مبنية يدوياً بألوان مُتحقق منها لعمى الألوان، مع وضع داكن وعرض جدولي لكل رسم
- 🎙 **أريا — المساعدة الصوتية** — شات بوت محلي يرد نصاً وصوتاً؛ لا يعمل الصوت تلقائياً أبداً: زر «ابدأ» أعلى يمين الصفحة للتشغيل والإيقاف، وأيقونة المحادثة داخل الشات للحديث الصوتي (استماع مرة ورد مرة ثم صمت)
- 🔍 **نموذج بحث عن الرحلات** — مع تحقق من صحة المدخلات
- ♿ **إتاحة** — عناوين دلالية، تسميات ARIA، تباين ألوان مفحوص آلياً

### هيكل الملفات | Structure

```
├── index.html          # الصفحة الرئيسية
├── dashboard.html      # لوحة تحكم العمليات
├── css/                # style.css + dashboard.css + aria.css
├── js/                 # main.js + dashboard.js + aria.js
└── assets/favicon.svg
```

### التشغيل محلياً | Run locally

```bash
python3 -m http.server 8000
# ثم افتح http://localhost:8000
```

### النشر | Deployment

الموقع ثابت بالكامل ويمكن نشره على GitHub Pages أو Netlify أو Vercel أو Cloudflare Pages بربط المستودع مباشرة — لا حاجة لأي خطوة بناء.

---

## الجزء الثاني: تطبيق TanStack Start | TanStack Start app

Saudi Energy Transportation web app, built on TanStack Start (React + TanStack Router + TanStack Query + Tailwind).

### Getting started

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:3000 by default. Vite will generate `src/routeTree.gen.ts` automatically on first run.

### Scripts

- `npm run dev` — start the dev server (SSR + HMR)
- `npm run build` — build for production into `.output/`
- `npm start` — run the built production server
- `npm run typecheck` — TypeScript check, no emit

### Layout

- `src/routes/__root.tsx` — root layout (head metadata, error/404 boundaries, HTML shell)
- `src/routes/index.tsx` — home page
- `src/router.tsx` — router factory wiring TanStack Query into route context
- `src/client.tsx` / `src/ssr.tsx` — TanStack Start entry points
- `src/styles.css` — Tailwind + design tokens (shadcn-style HSL variables)

---

## الجزء الثالث: بلتكس HSE — نظام إدارة مخاطر السلامة والصحة المهنية | Biltix HSE

مجلد `biltix-hse/` يحتوي نظام إدارة مخاطر السلامة والصحة المهنية لشركة بلتكس: لوحة قيادة هندسية ثنائية اللغة (الإنجليزية افتراضياً، والعربية RTL) برادارات متحركة باستمرار، سجل مخاطر، حوادث، تصاريح عمل، تفتيش، تدريب، امتثال ISO 45001، ومركز تكاملات قابل للتهيئة. موقع ثابت بالكامل بدون خطوة بناء — جذر النشر على Vercel هو `biltix-hse/`.

الرابط الحي: https://biltix-risk-ai.vercel.app — التفاصيل في `biltix-hse/README.md` والعقد البرمجي في `biltix-hse/docs/ARCHITECTURE.md`.
