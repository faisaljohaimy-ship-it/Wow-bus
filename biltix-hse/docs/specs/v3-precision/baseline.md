# v3 baseline — production commit abf26c2 (measured 2026-11-10)

Conditions: local `serve@14.2.7` with brotli compression (the production host *.vercel.app is not reachable
from the build sandbox), Playwright 1.63 / Chromium 153, Lighthouse 12.8.2, axe-core 4.14, time frozen at
2026-11-10T09:00:00+03:00, Asia/Riyadh, empty localStorage. Byte counts are comparable with production;
absolute timings are lab values, not field data. Raw artefacts: scratchpad `v3/baseline/` (128 screenshots,
Lighthouse JSON, axe JSON, 40 evidence crops).

## Performance (Lighthouse, median of 3)

| Route | Preset | Perf | A11y | BP | FCP | LCP | TBT | CLS | Transfer | JS | Requests |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cockpit | mobile | 85 | 96 | 100 | 2.33 s | 3.06 s | 274 ms | 0 | 916 KB | 639 KB | 60 |
| cockpit | desktop | 91 | 93 | 100 | 1.20 s | 1.30 s | 0 | 0.105 | 916 KB | 639 KB | 60 |
| settings | mobile | 89 | 91 | 100 | 2.29 s | 2.97 s | 200 ms | 0 | 916 KB | 639 KB | 60 |
| settings | desktop | 93 | 91 | 100 | 0.77 s | 1.33 s | 0 | 0.105 | 916 KB | 639 KB | 60 |
| airisks | mobile | 88 | 92 | 100 | 2.28 s | 2.97 s | 220 ms | 0 | 916 KB | 639 KB | 60 |
| airisks | desktop | 93 | 95 | 100 | 1.04 s | 1.06 s | 0 | 0.105 | 916 KB | 639 KB | 60 |

Causes: all 22 views load at boot (39 scripts, 639 KB compressed / 2.23 MB raw; platform-seed 80 KB and
seed 51 KB compressed); render-blocking Google Fonts CSS (~940 ms mobile); desktop CLS from the main area
shifting during boot. Interaction proxy (row click → drawer next frame): 64–72 ms unthrottled, 187–267 ms
at 4× CPU slowdown (INP "needs improvement" band). Field INP not measurable here.

## Accessibility (axe, cockpit/settings/airisks, dark+light, 1440+390)

color-contrast serious 131 nodes (rail codes 3.82:1, light muted #6b7890 4.45:1, warning badge 3.26:1);
label-content-name-mismatch serious 18 (status pills); button-name critical 6 and target-size serious 6
(search button 2×36 px at 390); aria-allowed-role minor 40 (domain tiles button[role=listitem]).

## Review observations — all reproduced

| # | Observation | Evidence (baseline) |
|---|---|---|
| a | Demo vs live claims | Settings says data is simulated and stored locally, while the app bar shows "22/36 متصل", integrations "11 من 19 متصل" (two different counts), feed footer "متصل بالأنظمة الحية", 22 connectors "متصل", engine precision/recall/ECE values hard-coded in the seed; no disclaimer on cockpit, register, data quality, reports. |
| b | No language switch | Page always ar/rtl; no control in shell, settings or command palette; settings has no `lang`. |
| c | Panels reduce content width | 1440: main 884 px (61 %) beside 236 px rail + 320 px feed; 1280: 724 px; domain tiles shrink to 101 px and spill their badge. |
| d | Truncated labels, weak secondary text | 6/22 rail labels cut at 1280–1440; 3/5 tab labels cut at 360–390; muted grey 3.89–4.45:1 on light surfaces; rail codes 10 px; light theme forced to the dark accent (≈1.9:1). |
| e | Name alternates | "بلتكس Risk AI" in shell/title; "بلتكس HSE" in logo, reports, training provider, manifest, test alerts; "Biltix HSE" in About; "Biltix Risk AI" in an alert payload; export file names mixed. |
| f | Inconsistent overdue counts | Reports: 7 overdue risks in summary/subtitle/recommendations but "6" in the RPT-04 narrative because `buildReport` slices the list to 6 and prints its length; inspections 8 vs 4 in two places. |
| g | Increase described as decrease | "تراجع مؤشر LTIFR إلى 0.88 مقابل 0" — LTIFR +0.88 and TRIR +0.35 rose; word chosen with `d <= 0 ? 'تحسّن' : 'تراجع'`. |
| h | Future timestamps | Integrations "آخر مزامنة خلال 4 ساعات"; engine/cockpit "آخر تشغيل خلال 14 دقيقة"; data quality "خلال 5 دقائق…"; cause: whole-day re-anchoring of seed times written at 12:40. |
| i | Weight/threshold links | Cockpit weight chips link to settings, which has no weights editor (dead end, no 100 % validation); threshold sliders in alerts silently clamp invalid input, no error state. |

## Cross-browser

WebKit not available: Playwright CDN hosts (cdn.playwright.dev, playwright.download.prss.microsoft.com) are
blocked by the environment's network policy. Chromium only; no real-device iPhone test.
