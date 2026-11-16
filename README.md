> **This repository holds two separate projects | يحتوي هذا المستودع على مشروعين منفصلين**
>
> - **Faisal Security Lab** — an open-source, self-hosted platform for defensive
>   security testing. It runs real scanners (Semgrep, Bandit, Gitleaks,
>   pip-audit, OSV-Scanner) only inside an authorization scope you grant, and
>   produces findings and reports in Arabic and English. Start here:
>   [`faisal-security-lab/README.md`](faisal-security-lab/README.md).
>   **Use it only on systems you own or have written permission to test.
>   Scanning other people's systems can be illegal; you are responsible for what
>   you scan.**
>
>   منصة مفتوحة المصدر للفحص الأمني الدفاعي. ابدأ من هنا:
>   [`faisal-security-lab/README.md`](faisal-security-lab/README.md).
>   **استخدمها فقط على الأنظمة التي تملكها أو التي لديك إذن مكتوب بفحصها. فحص
>   أنظمة الآخرين دون إذن قد يكون مخالفًا للقانون، وأنت المسؤول عمّا تفحصه.**
> - **Neexios** — the bus-booking site described below (repository root and
>   `src/`).
>
>   موقع حجز رحلات الباصات الموصوف أدناه (جذر المستودع والمجلد `src/`).
>
> **Licence.** Faisal Security Lab is licensed under either Apache-2.0 or MIT,
> at your option
> ([`LICENSE-APACHE`](faisal-security-lab/LICENSE-APACHE),
> [`LICENSE-MIT`](faisal-security-lab/LICENSE-MIT)). The licences cover the
> security platform: everything in `faisal-security-lab/` and the platform's own
> files at the repository root, which are `render.yaml`, `.gitleaksignore`,
> `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
> `.github/workflows/faisal-security-lab-ci.yml`,
> `.github/pull_request_template.md` and the files under
> `.github/ISSUE_TEMPLATE/`. Nothing else in the repository is covered: the
> Neexios site (the rest of the repository root and `src/`) is not covered by
> these licences.
>
> **الترخيص.** منصة Faisal Security Lab مرخَّصة بأحد الترخيصين Apache-2.0 أو MIT،
> والخيار لك
> ([`LICENSE-APACHE`](faisal-security-lab/LICENSE-APACHE)،
> [`LICENSE-MIT`](faisal-security-lab/LICENSE-MIT)). يشمل الترخيصان منصة الأمن:
> كل ما في المجلد `faisal-security-lab/` وملفات المنصة نفسها الموجودة في جذر
> المستودع، وهي: `render.yaml`، `.gitleaksignore`، `SECURITY.md`،
> `CONTRIBUTING.md`، `CODE_OF_CONDUCT.md`،
> `.github/workflows/faisal-security-lab-ci.yml`،
> `.github/pull_request_template.md`، والملفات الموجودة داخل
> `.github/ISSUE_TEMPLATE/`. لا يشمل الترخيصان أي شيء آخر في المستودع: موقع
> Neexios (بقية جذر المستودع والمجلد `src/`) غير مشمول بهذين الترخيصين.

# Neexios — neexios.com

منصة ذكية لحجز رحلات الباصات | A smart bus booking platform.

يتكوّن موقع Neexios من جزأين | The Neexios site has two parts:

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

مجلد `biltix-hse/` يحتوي نظام إدارة مخاطر السلامة والصحة المهنية لشركة بلتكس: لوحة قيادة هندسية عربية (RTL) برادارات متحركة باستمرار، سجل مخاطر، حوادث، تصاريح عمل، تفتيش، تدريب، امتثال ISO 45001، ومركز تكاملات قابل للتهيئة. موقع ثابت بالكامل بدون خطوة بناء — جذر النشر على Vercel هو `biltix-hse/`.

الرابط الحي: https://biltix-risk-ai.vercel.app — التفاصيل في `biltix-hse/README.md` والعقد البرمجي في `biltix-hse/docs/ARCHITECTURE.md`.
