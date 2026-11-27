 
(function (w) { w.SQDS_ICONS = {"name":"Sovereign Quantum Iconography","version":"1.1.0","generatedBy":"sqds/tools/build.cjs from sqds/src/icons.src.cjs","usage":"Render each icon at viewBox 0 0 48 48. groups[] are <g> layers in paint order (data-part = part); items[] are SVG elements with their attributes and a role (see roles/paint). motion.tracks describe the one-shot semantic animation; in Remotion drive them with interpolate(frame, ...) over motion.durationMs at the composition fps.","count":25,"grid":{"size":48,"viewBox":"0 0 48 48","liveArea":[4,4,44,44],"keylines":{"circle":{"cx":24,"cy":24,"r":20},"square":{"x":6,"y":6,"size":36},"portrait":{"x":8,"y":4,"w":32,"h":40},"landscape":{"x":4,"y":8,"w":40,"h":32}}},"stroke":{"base":1.75,"detail":1.2,"small":2.25,"cap":"round","join":"round","note":"Widths are in grid units. Below 32 CSS px use `small` for base strokes."},"roles":{"body":{"fill":"glass","stroke":"edge"},"line":{"fill":"none","stroke":"edge"},"detail":{"fill":"none","stroke":"edge","opacity":0.55,"width":"detail"},"accent":{"fill":"none","stroke":"accent"},"accentFill":{"fill":"accent","stroke":"none"},"accentBody":{"fill":"accentSoft","stroke":"accent"},"trace":{"fill":"none","stroke":"accent","restOpacity":0},"ghost":{"fill":"accent","stroke":"none","restOpacity":0},"occlude":{"fill":"field","stroke":"none"}},"paint":{"glass":{"type":"linear","x1":0,"y1":0,"x2":0.35,"y2":1,"stops":[[0,"rgba(247, 250, 255, .26)"],[0.55,"rgba(41, 229, 242, .10)"],[1,"rgba(71, 123, 255, .07)"]]},"edge":"#B8F3FA","edgeHover":"#29E5F2","accent":"#29E5F2","accentSoft":"rgba(41, 229, 242, .16)","accentVerified":"#E8BC78","field":"#040914"},"layers":{"note":"Cinematic optical-glass recipe (V1000), drawn from the same geometry for every body element: a depth copy behind it (offset, faint cyan fill and edge), the glass body, an inner-light copy (radial gradient) and a fine specular edge copy. Renderers may skip the three extra copies below 32 px (detail \"lite\").","depth":{"offset":[0.9,1.3],"hoverOffset":[1.6,2.4],"fill":"rgba(41, 229, 242, .07)","stroke":"rgba(41, 229, 242, .30)","widthFactor":0.55},"light":{"type":"radial","cx":0.35,"cy":0.28,"r":0.75,"stops":[[0,"rgba(247, 250, 255, .42)"],[0.45,"rgba(41, 229, 242, .10)"],[1,"rgba(41, 229, 242, 0)"]]},"spec":{"type":"linear","x1":0,"y1":0,"x2":1,"y2":1,"stops":[[0,"rgba(255, 255, 255, .95)"],[0.35,"rgba(184, 243, 250, .35)"],[0.6,"rgba(184, 243, 250, 0)"],[1,"rgba(41, 229, 242, .35)"]],"widthFactor":0.5},"gold":"The accent turns Royal Gold only when the host carries data-signal verified, approved or release."},"hoverKinds":{"trace":"an accent dash (18 % of the outline) runs once along the part edge, 720 ms","orbit":"the part turns deg degrees once around origin, 760 ms","lift":"the glass layers rise 1.5 units off their depth layer and settle, 560 ms","scan":"a light line passes once from top to bottom, 760 ms","pulse":"the part scales 1 -> 1.16 -> 1 once, 520 ms"},"states":{"static":"Rest: glass bodies, pale cyan edges, cyan accent.","hover":"Hover or keyboard focus on the host: edges turn Electric Cyan, the glass brightens, the depth layer separates, and the icon's hover micro-animation (hover.kind) runs once.","animate":"Semantic animation: the `motion` tracks run once when the host is activated or its state changes, never in a loop; skipped under prefers-reduced-motion."},"pages":{"home":"home","films":"cinema","workflows":"workflows","capabilities":"capabilities","projects":"projects","evidence":"evidence","briefing":"briefing","company":"company"},"icons":[{"id":"ai","name":["الذكاء الاصطناعي","Artificial intelligence"],"meaning":["نواة عصبية زجاجية تضيء عُقدها من المركز إلى الأطراف عند التفعيل.","A glass neural core; its nodes light from the centre outwards when activated."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"orbit","items":[{"el":"ellipse","cx":24,"cy":21,"rx":19.5,"ry":6,"transform":"rotate(-18 24 21)","role":"detail"}]},{"part":"orb","items":[{"el":"circle","cx":24,"cy":21,"r":13.5,"role":"body"}]},{"part":"net","items":[{"el":"path","d":"M24 13L30.93 17L30.93 25L24 29L17.07 25L17.07 17ZM24 21L24 13M24 21L30.93 17M24 21L30.93 25M24 21L24 29M24 21L17.07 25M24 21L17.07 17","role":"detail"}]},{"part":"nodes","items":[{"el":"circle","cx":24,"cy":13,"r":1.5,"role":"accentFill"},{"el":"circle","cx":30.93,"cy":17,"r":1.5,"role":"accentFill"},{"el":"circle","cx":30.93,"cy":25,"r":1.5,"role":"accentFill"},{"el":"circle","cx":24,"cy":29,"r":1.5,"role":"accentFill"},{"el":"circle","cx":17.07,"cy":25,"r":1.5,"role":"accentFill"},{"el":"circle","cx":17.07,"cy":17,"r":1.5,"role":"accentFill"}]},{"part":"core","items":[{"el":"circle","cx":24,"cy":21,"r":2.4,"role":"accentFill"}]},{"part":null,"items":[{"el":"ellipse","cx":24,"cy":41,"rx":9,"ry":2,"role":"detail"}]}],"motion":{"name":"ignite","durationMs":900,"easing":"emphasized","tracks":[{"part":"core","prop":"scale","origin":[24,21],"keys":[1,1.9,1]},{"part":"nodes","prop":"opacity","keys":[0.25,1],"delayMs":140},{"part":"net","prop":"opacity","keys":[0.2,1],"delayMs":140},{"part":"orbit","prop":"rotate","origin":[24,21],"keys":[-30,0]}]},"hover":{"kind":"orbit","part":"orbit","origin":[24,21],"deg":180}},{"id":"systems","name":["هندسة الأنظمة","Systems engineering"],"meaning":["ترسان متعاشقان يدوران سنًّا واحدة معًا: أجزاء مهندسة تعمل كنظام واحد.","Two meshing gears turn by one tooth together: engineered parts working as one system."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"gearB","items":[{"el":"path","d":"M39.69 33.18L41.39 34.23A8.2 8.2 0 0 1 40.65 36.01L38.71 35.54A6.3 6.3 0 0 1 37.04 37.21L37.51 39.15A8.2 8.2 0 0 1 35.73 39.89L34.68 38.19A6.3 6.3 0 0 1 32.32 38.19L31.27 39.89A8.2 8.2 0 0 1 29.49 39.15L29.96 37.21A6.3 6.3 0 0 1 28.29 35.54L26.35 36.01A8.2 8.2 0 0 1 25.61 34.23L27.31 33.18A6.3 6.3 0 0 1 27.31 30.82L25.61 29.77A8.2 8.2 0 0 1 26.35 27.99L28.29 28.46A6.3 6.3 0 0 1 29.96 26.79L29.49 24.85A8.2 8.2 0 0 1 31.27 24.11L32.32 25.81A6.3 6.3 0 0 1 34.68 25.81L35.73 24.11A8.2 8.2 0 0 1 37.51 24.85L37.04 26.79A6.3 6.3 0 0 1 38.71 28.46L40.65 27.99A8.2 8.2 0 0 1 41.39 29.77L39.69 30.82A6.3 6.3 0 0 1 39.69 33.18ZM36.1 32A2.6 2.6 0 1 0 30.9 32A2.6 2.6 0 1 0 36.1 32Z","role":"body","fillRule":"evenodd"}]},{"part":"gearA","items":[{"el":"path","d":"M28.87 19.37L31.54 19.81A12.6 12.6 0 0 1 31.54 22.19L28.87 22.63A10 10 0 0 1 27.94 25.48L29.85 27.41A12.6 12.6 0 0 1 28.45 29.33L26.03 28.12A10 10 0 0 1 23.6 29.88L24 32.56A12.6 12.6 0 0 1 21.75 33.3L20.5 30.89A10 10 0 0 1 17.5 30.89L16.25 33.3A12.6 12.6 0 0 1 14 32.56L14.4 29.88A10 10 0 0 1 11.97 28.12L9.55 29.33A12.6 12.6 0 0 1 8.15 27.41L10.06 25.48A10 10 0 0 1 9.13 22.63L6.46 22.19A12.6 12.6 0 0 1 6.46 19.81L9.13 19.37A10 10 0 0 1 10.06 16.52L8.15 14.59A12.6 12.6 0 0 1 9.55 12.67L11.97 13.88A10 10 0 0 1 14.4 12.12L14 9.44A12.6 12.6 0 0 1 16.25 8.7L17.5 11.11A10 10 0 0 1 20.5 11.11L21.75 8.7A12.6 12.6 0 0 1 24 9.44L23.6 12.12A10 10 0 0 1 26.03 13.88L28.45 12.67A12.6 12.6 0 0 1 29.85 14.59L27.94 16.52A10 10 0 0 1 28.87 19.37ZM23.2 21A4.2 4.2 0 1 0 14.8 21A4.2 4.2 0 1 0 23.2 21Z","role":"body","fillRule":"evenodd"}]},{"part":null,"items":[{"el":"circle","cx":19,"cy":21,"r":1.4,"role":"accentFill"},{"el":"circle","cx":33.5,"cy":32,"r":1,"role":"accentFill"}]}],"motion":{"name":"mesh","durationMs":820,"easing":"emphasized","tracks":[{"part":"gearA","prop":"rotate","origin":[19,21],"keys":[0,36]},{"part":"gearB","prop":"rotate","origin":[33.5,32],"keys":[0,-45]}]},"hover":{"kind":"trace","part":"gearA"}},{"id":"architecture","name":["معمارية الذكاء الاصطناعي","AI architecture"],"meaning":["ثلاث طبقات زجاجية تنفصل لحظة ثم تستقر: بنية مكشوفة طبقة طبقة.","Three glass layers part for a moment and settle: a structure shown layer by layer."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"layer3","items":[{"el":"path","d":"M9 30.5L24 37L39 30.5V33.1L24 39.6L9 33.1Z","role":"body"},{"el":"path","d":"M24 24L39 30.5L24 37L9 30.5Z","role":"body"}]},{"part":"layer2","items":[{"el":"path","d":"M9 21.5L24 28L39 21.5V24.1L24 30.6L9 24.1Z","role":"body"},{"el":"path","d":"M24 15L39 21.5L24 28L9 21.5Z","role":"body"}]},{"part":"layer1","items":[{"el":"path","d":"M9 12.5L24 19L39 12.5V15.1L24 21.6L9 15.1Z","role":"body"},{"el":"path","d":"M24 6L39 12.5L24 19L9 12.5Z","role":"body"},{"el":"path","d":"M24 10.35L29 12.5L24 14.65L19 12.5Z","role":"accentBody"}]}],"motion":{"name":"separate","durationMs":900,"easing":"inout","tracks":[{"part":"layer1","prop":"translate","keys":[[0,0],[0,-3.2],[0,0]]},{"part":"layer3","prop":"translate","keys":[[0,0],[0,3.2],[0,0]]}]},"hover":{"kind":"lift","parts":["layer1","layer2"]}},{"id":"agents","name":["النماذج والوكلاء","Models and agents"],"meaning":["نموذج واحد يوزّع العمل على ثلاث مهام بترتيب محدد؛ لا يوحي باستقلال غير موجود.","One model passes work to three tasks in a set order; it implies no autonomy that does not exist."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":null,"items":[{"el":"path","d":"M10.5 34Q24 44 37.5 34","role":"detail"}]},{"part":"links","items":[{"el":"path","d":"M20.17 20.75L12.98 30.61","role":"line","pathLength":1,"id":"l0"},{"el":"path","d":"M24 22L24 34.3","role":"line","pathLength":1,"id":"l1"},{"el":"path","d":"M27.83 20.75L35.02 30.61","role":"line","pathLength":1,"id":"l2"}]},{"part":"sat0","items":[{"el":"circle","cx":10.5,"cy":34,"r":4.2,"role":"body"}]},{"part":"sat1","items":[{"el":"circle","cx":24,"cy":38.5,"r":4.2,"role":"body"}]},{"part":"sat2","items":[{"el":"circle","cx":37.5,"cy":34,"r":4.2,"role":"body"}]},{"part":"model","items":[{"el":"circle","cx":24,"cy":15.5,"r":6.5,"role":"body"},{"el":"circle","cx":24,"cy":15.5,"r":2.4,"role":"accentFill"}]}],"motion":{"name":"traverse","durationMs":1100,"easing":"standard","tracks":[{"part":"links","prop":"draw","keys":[1,0],"durationMs":700},{"part":"sat0","prop":"scale","origin":[10.5,34],"keys":[1,1.22,1],"delayMs":250,"durationMs":420},{"part":"sat1","prop":"scale","origin":[24,38.5],"keys":[1,1.22,1],"delayMs":450,"durationMs":420},{"part":"sat2","prop":"scale","origin":[37.5,34],"keys":[1,1.22,1],"delayMs":650,"durationMs":420}]},"hover":{"kind":"pulse","part":"model","origin":[24,15.5]}},{"id":"code","name":["أدوات المطوّرين والبرمجة","Developer tools and code"],"meaning":["نافذتا شيفرة مكدستان تنزلق الخلفية منهما إلى الأمام: عمل برمجي متتابع.","Two stacked code windows; the back one slides forward: successive code work."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"back","items":[{"el":"path","d":"M16 7H38L41 10V25L38 28H16L13 25V10Z","role":"detail"}]},{"part":"front","items":[{"el":"rect","x":7,"y":14.5,"width":30,"height":25,"rx":3,"role":"body"},{"el":"path","d":"M7 20H37","role":"detail"},{"el":"circle","cx":10.75,"cy":17.25,"r":0.95,"role":"accentFill"},{"el":"circle","cx":13.75,"cy":17.25,"r":0.95,"role":"accentFill"},{"el":"circle","cx":16.75,"cy":17.25,"r":0.95,"role":"accentFill"}]},{"part":"glyph","items":[{"el":"path","d":"M17.5 25.5L13.5 29.5L17.5 33.5M26.5 25.5L30.5 29.5L26.5 33.5M23.6 24L20.4 35","role":"accent"}]}],"motion":{"name":"scroll","durationMs":760,"easing":"emphasized","tracks":[{"part":"back","prop":"translate","keys":[[0,0],[-2.4,2.4],[0,0]]},{"part":"glyph","prop":"translate","keys":[[0,2],[0,0]]},{"part":"glyph","prop":"opacity","keys":[0.2,1]}]},"hover":{"kind":"scan"}},{"id":"automation","name":["الأتمتة","Automation"],"meaning":["سهمان يُكملان ثلث دورة حول ترس: خطوة آلية محددة ومتكررة.","Two arrows complete a third of a cycle around a gear: one defined, repeatable step."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"cycle","items":[{"el":"path","d":"M9.43 18.7A15.5 15.5 0 0 1 37.14 15.79M33.76 14.55L37.14 15.79L37.52 12.21","role":"line"},{"el":"path","d":"M38.57 29.3A15.5 15.5 0 0 1 10.86 32.21M14.24 33.45L10.86 32.21L10.48 35.79","role":"line"}]},{"part":"gear","items":[{"el":"path","d":"M30.36 22.68L32.34 23.01A8.4 8.4 0 0 1 32.34 24.99L30.36 25.32A6.5 6.5 0 0 1 29.43 27.57L30.6 29.2A8.4 8.4 0 0 1 29.2 30.6L27.57 29.43A6.5 6.5 0 0 1 25.32 30.36L24.99 32.34A8.4 8.4 0 0 1 23.01 32.34L22.68 30.36A6.5 6.5 0 0 1 20.43 29.43L18.8 30.6A8.4 8.4 0 0 1 17.4 29.2L18.57 27.57A6.5 6.5 0 0 1 17.64 25.32L15.66 24.99A8.4 8.4 0 0 1 15.66 23.01L17.64 22.68A6.5 6.5 0 0 1 18.57 20.43L17.4 18.8A8.4 8.4 0 0 1 18.8 17.4L20.43 18.57A6.5 6.5 0 0 1 22.68 17.64L23.01 15.66A8.4 8.4 0 0 1 24.99 15.66L25.32 17.64A6.5 6.5 0 0 1 27.57 18.57L29.2 17.4A8.4 8.4 0 0 1 30.6 18.8L29.43 20.43A6.5 6.5 0 0 1 30.36 22.68ZM26.7 24A2.7 2.7 0 1 0 21.3 24A2.7 2.7 0 1 0 26.7 24Z","role":"body","fillRule":"evenodd"}]},{"part":null,"items":[{"el":"circle","cx":24,"cy":24,"r":1.1,"role":"accentFill"}]}],"motion":{"name":"cycle","durationMs":900,"easing":"emphasized","tracks":[{"part":"cycle","prop":"rotate","origin":[24,24],"keys":[0,120]},{"part":"gear","prop":"rotate","origin":[24,24],"keys":[0,45]}]},"hover":{"kind":"orbit","part":"cycle","origin":[24,24],"deg":180}},{"id":"security","name":["الأمن","Security"],"meaning":["يُغلق القفل ويُرسم إطار الدرع: تحقق ظاهر لا وعد.","The lock closes and the shield outline is traced: a visible check, not a promise."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"shield","items":[{"el":"path","d":"M24 5.5L38.5 10.8V21.5C38.5 31 32.3 38.2 24 42C15.7 38.2 9.5 31 9.5 21.5V10.8Z","role":"body"}]},{"part":null,"items":[{"el":"path","d":"M24 9.4L35 13.4V21.5C35 28.9 30.4 34.6 24 37.7","role":"detail"}]},{"part":"trace","items":[{"el":"path","d":"M24 5.5L38.5 10.8V21.5C38.5 31 32.3 38.2 24 42C15.7 38.2 9.5 31 9.5 21.5V10.8Z","role":"trace","pathLength":1}]},{"part":"shackle","items":[{"el":"path","d":"M19.8 23V19.6A4.2 4.2 0 0 1 28.2 19.6V23","role":"accent"}]},{"part":"lock","items":[{"el":"rect","x":17.5,"y":22.5,"width":13,"height":10,"rx":2,"role":"accentBody"},{"el":"circle","cx":24,"cy":26.6,"r":1.3,"role":"accentFill"},{"el":"path","d":"M24 27.6V29.8","role":"accent"}]}],"motion":{"name":"verify","durationMs":900,"easing":"emphasized","tracks":[{"part":"shackle","prop":"translate","keys":[[0,-2.4],[0,0]],"durationMs":420},{"part":"trace","prop":"draw","keys":[1,0],"delayMs":200,"durationMs":650},{"part":"trace","prop":"opacity","keys":[0,1,1,0],"delayMs":200,"durationMs":700}]},"hover":{"kind":"scan"}},{"id":"data","name":["البيانات والتحليلات ومؤشرات الأداء","Data, analytics and KPIs"],"meaning":["تنمو الأعمدة من خط الأساس إلى قيمها ثم يُرسم الاتجاه: حركة من أرقام محسوبة.","Bars grow from the baseline to their values, then the trend is drawn: motion from computed numbers."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":null,"items":[{"el":"path","d":"M6.5 40H41.5","role":"line"}]},{"part":"bar0","items":[{"el":"rect","x":9,"y":32,"width":6,"height":8,"rx":1.5,"role":"body"}]},{"part":"bar1","items":[{"el":"rect","x":17,"y":27,"width":6,"height":13,"rx":1.5,"role":"body"}]},{"part":"bar2","items":[{"el":"rect","x":25,"y":22,"width":6,"height":18,"rx":1.5,"role":"body"}]},{"part":"bar3","items":[{"el":"rect","x":33,"y":15,"width":6,"height":25,"rx":1.5,"role":"body"}]},{"part":"trend","items":[{"el":"path","d":"M12 27.5L20 22.5L28 17.5L36 10","role":"accent","pathLength":1}]},{"part":"end","items":[{"el":"circle","cx":36,"cy":10,"r":2.2,"role":"accentFill"}]}],"motion":{"name":"grow","durationMs":900,"easing":"data","tracks":[{"part":"bar0","prop":"scale","origin":[12,40],"keys":[[1,0.2],[1,1]],"durationMs":520},{"part":"bar1","prop":"scale","origin":[20,40],"keys":[[1,0.2],[1,1]],"delayMs":60,"durationMs":520},{"part":"bar2","prop":"scale","origin":[28,40],"keys":[[1,0.2],[1,1]],"delayMs":120,"durationMs":520},{"part":"bar3","prop":"scale","origin":[36,40],"keys":[[1,0.2],[1,1]],"delayMs":180,"durationMs":520},{"part":"trend","prop":"draw","keys":[1,0],"delayMs":360,"durationMs":540},{"part":"end","prop":"opacity","keys":[0,1],"delayMs":780,"durationMs":120}]},"hover":{"kind":"trace","part":"trend"}},{"id":"cloud","name":["البنية السحابية","Cloud infrastructure"],"meaning":["تتحرك طبقات الخوادم طبقةً بعد طبقة تحت السحابة: بنية مطبّقة على مستويات.","Server tiers shift one after another under the cloud: infrastructure in levels."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"cloud","items":[{"el":"path","d":"M15.5 22A5 5 0 1 1 16.63 12.13A7.5 7.5 0 0 1 31.13 11.17A5.5 5.5 0 1 1 32.5 22Z","role":"body"}]},{"part":"beam","items":[{"el":"path","d":"M24 22.4V26","role":"accent"}]},{"part":"tier0","items":[{"el":"path","d":"M13.2 26H34.8L36 27.2V28.6L34.8 29.8H13.2L12 28.6V27.2Z","role":"body"},{"el":"circle","cx":32.4,"cy":27.9,"r":0.9,"role":"accentFill"}]},{"part":"tier1","items":[{"el":"path","d":"M13.2 31.2H34.8L36 32.4V33.8L34.8 35H13.2L12 33.8V32.4Z","role":"body"},{"el":"circle","cx":32.4,"cy":33.1,"r":0.9,"role":"accentFill"}]},{"part":"tier2","items":[{"el":"path","d":"M13.2 36.4H34.8L36 37.6V39L34.8 40.2H13.2L12 39V37.6Z","role":"body"},{"el":"circle","cx":32.4,"cy":38.3,"r":0.9,"role":"accentFill"}]}],"motion":{"name":"stack","durationMs":820,"easing":"inout","tracks":[{"part":"tier0","prop":"translate","keys":[[0,0],[0,-1.5],[0,0]],"durationMs":440},{"part":"tier1","prop":"translate","keys":[[0,0],[0,-1.5],[0,0]],"delayMs":110,"durationMs":440},{"part":"tier2","prop":"translate","keys":[[0,0],[0,-1.5],[0,0]],"delayMs":220,"durationMs":440},{"part":"beam","prop":"opacity","keys":[1,0.2,1],"durationMs":660}]},"hover":{"kind":"lift","parts":["cloud","tier0"]}},{"id":"motion","name":["تصميم الحركة مع Remotion","Remotion and motion"],"meaning":["يتقدم رأس التشغيل على الخط الزمني ويُرسم منحنى التسارع إطارًا بعد إطار.","The playhead advances along the timeline and the easing curve is drawn frame by frame."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":null,"items":[{"el":"path","d":"M7 37H41","role":"line"},{"el":"path","d":"M15.5 35.4V38.6M24 35.4V38.6M32.5 35.4V38.6","role":"detail"}]},{"part":"curve","items":[{"el":"path","d":"M9.5 31C21 31 24 11 38.5 11","role":"accent","pathLength":1}]},{"part":"key0","items":[{"el":"path","d":"M9.5 34.4L12.1 37L9.5 39.6L6.9 37Z","role":"body"}]},{"part":"key1","items":[{"el":"path","d":"M38.5 34.4L41.1 37L38.5 39.6L35.9 37Z","role":"accentBody"}]},{"part":"playhead","items":[{"el":"path","d":"M30 9V40","role":"detail"},{"el":"path","d":"M27.6 7.6H32.4L30 10.4Z","role":"accentFill"}]}],"motion":{"name":"play","durationMs":1000,"easing":"inout","tracks":[{"part":"playhead","prop":"translate","keys":[[-20.5,0],[0,0]]},{"part":"curve","prop":"draw","keys":[1,0]},{"part":"key1","prop":"scale","origin":[38.5,37],"keys":[1,1.3,1],"delayMs":760,"durationMs":240}]},"hover":{"kind":"trace","part":"curve"}},{"id":"projects","name":["المشاريع المهنية","Professional projects"],"meaning":["تمتلئ ثلاث محطات على مسار المشروع بالترتيب: تقدّم مسجّل لا مزعوم.","Three milestones on the project line fill in order: recorded progress, not claimed."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"folder","items":[{"el":"path","d":"M6 13.5A2 2 0 0 1 8 11.5H17.2A2 2 0 0 1 18.8 12.3L20.8 15H40A2 2 0 0 1 42 17V38.5A2 2 0 0 1 40 40.5H8A2 2 0 0 1 6 38.5Z","role":"body"}]},{"part":null,"items":[{"el":"path","d":"M6 19.5H42","role":"detail"},{"el":"path","d":"M13 30H35","role":"line"}]},{"part":"m0","items":[{"el":"circle","cx":13,"cy":30,"r":2.5,"role":"accentFill"}]},{"part":"m1","items":[{"el":"circle","cx":24,"cy":30,"r":2.5,"role":"accentFill"}]},{"part":"m2","items":[{"el":"circle","cx":35,"cy":30,"r":2.5,"role":"body"}]}],"motion":{"name":"milestones","durationMs":900,"easing":"standard","tracks":[{"part":"m0","prop":"scale","origin":[13,30],"keys":[0.4,1.25,1],"durationMs":360},{"part":"m1","prop":"scale","origin":[24,30],"keys":[0.4,1.25,1],"delayMs":220,"durationMs":360},{"part":"m2","prop":"scale","origin":[35,30],"keys":[0.4,1.25,1],"delayMs":440,"durationMs":360}]},"hover":{"kind":"pulse","part":"m2","origin":[35,30]}},{"id":"performance","name":["الأداء","Performance"],"meaning":["تتحرك الإبرة من الحد الأدنى إلى قراءتها مرة واحدة: قياس لا زخرفة.","The needle sweeps once from the minimum to its reading: a measurement, not decoration."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"dial","items":[{"el":"path","d":"M10.58 35.75A15.5 15.5 0 1 1 37.42 35.75","role":"line"}]},{"part":null,"items":[{"el":"path","d":"M14.3 33.6L12.74 34.5M14.3 22.4L12.74 21.5M24 16.8L24 15M33.7 22.4L35.26 21.5M33.7 33.6L35.26 34.5","role":"detail"}]},{"part":"needle","items":[{"el":"path","d":"M24 28L32.13 19.87","role":"accent"}]},{"part":null,"items":[{"el":"circle","cx":24,"cy":28,"r":2.7,"role":"body"},{"el":"path","d":"M15 40.5H33","role":"detail"}]}],"motion":{"name":"sweep","durationMs":900,"easing":"data","tracks":[{"part":"needle","prop":"rotate","origin":[24,28],"keys":[-120,0]}]},"hover":{"kind":"trace","part":"dial"}},{"id":"evidence","name":["الدليل","Evidence"],"meaning":["تظهر أسطر الوثيقة ثم يُختم التحقق: الختم ذهبي فقط حين تكون الحالة «مثبت».","The document lines appear, then the check is sealed; the seal turns gold only when the state is verified."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"back","items":[{"el":"path","d":"M16.5 4H35.5L38 6.5V32.5L35.5 35H16.5L14 32.5V6.5Z","role":"detail"}]},{"part":"page","items":[{"el":"path","d":"M10 7H26L32 13V39A2 2 0 0 1 30 41H10A2 2 0 0 1 8 39V9A2 2 0 0 1 10 7Z","role":"body"},{"el":"path","d":"M26 7V11A2 2 0 0 0 28 13H32","role":"detail"}]},{"part":"lines","items":[{"el":"path","d":"M12.5 19H24M12.5 24H27M12.5 29H21","role":"detail"}]},{"part":"seal","items":[{"el":"circle","cx":33.5,"cy":35.5,"r":7.5,"role":"occlude"},{"el":"circle","cx":33.5,"cy":35.5,"r":7.5,"role":"accentBody"}]},{"part":"check","items":[{"el":"path","d":"M30 35.6L32.4 38L37 33.2","role":"accent","pathLength":1}]}],"motion":{"name":"seal","durationMs":900,"easing":"emphasized","tracks":[{"part":"lines","prop":"opacity","keys":[0,1],"durationMs":300},{"part":"seal","prop":"scale","origin":[33.5,35.5],"keys":[0.82,1.06,1],"delayMs":250,"durationMs":420},{"part":"check","prop":"draw","keys":[1,0],"delayMs":420,"durationMs":420}],"signal":"verified"},"hover":{"kind":"scan"}},{"id":"integration","name":["التكامل","Integration"],"meaning":["تنتقل نقطة بيانات من نظام إلى آخر ثم تعود: ربط باتجاهين.","A data point crosses from one system to the other and back: a two-way link."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"left","items":[{"el":"path","d":"M8 13H15L18 16V32L15 35H8L5 32V16Z","role":"body"},{"el":"path","d":"M8.5 19.5H14.5M8.5 24H14.5M8.5 28.5H14.5","role":"detail"}]},{"part":"right","items":[{"el":"path","d":"M33 13H40L43 16V32L40 35H33L30 32V16Z","role":"body"},{"el":"path","d":"M33.5 19.5H39.5M33.5 24H39.5M33.5 28.5H39.5","role":"detail"}]},{"part":null,"items":[{"el":"path","d":"M18 19.5H29M25.6 16.6L29 19.5L25.6 22.4","role":"accent"},{"el":"path","d":"M30 28.5H19M22.4 25.6L19 28.5L22.4 31.4","role":"line"}]},{"part":"packet","items":[{"el":"circle","cx":18,"cy":19.5,"r":1.9,"role":"ghost"}]}],"motion":{"name":"flow","durationMs":1000,"easing":"inout","tracks":[{"part":"packet","prop":"translate","keys":[[0,0],[11,0],[12,9],[1,9]],"offsets":[0,0.45,0.55,1]},{"part":"packet","prop":"opacity","keys":[0,1,1,0],"offsets":[0,0.08,0.9,1]}]},"hover":{"kind":"trace","part":"left"}},{"id":"deployment","name":["النشر","Deployment"],"meaning":["يرتفع السهم من المنصة وتتسع حلقة الإطلاق مرة واحدة: إصدار يغادر إلى بيئته.","The arrow rises from the platform and the launch ring widens once: a release leaving for its environment."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":null,"items":[{"el":"ellipse","cx":24,"cy":39.5,"rx":15,"ry":3.6,"role":"body"},{"el":"ellipse","cx":24,"cy":39.5,"rx":8.5,"ry":1.9,"role":"detail"}]},{"part":"ring","items":[{"el":"ellipse","cx":24,"cy":26,"rx":9.5,"ry":2.6,"role":"detail"}]},{"part":"arrow","items":[{"el":"path","d":"M24 35V11.5M17 18.5L24 11.5L31 18.5","role":"accent"}]}],"motion":{"name":"launch","durationMs":820,"easing":"emphasized","tracks":[{"part":"arrow","prop":"translate","keys":[[0,4],[0,-1.2],[0,0]]},{"part":"ring","prop":"scale","origin":[24,26],"keys":[0.7,1.25,1]}]},"hover":{"kind":"lift","parts":["arrow"]}},{"id":"cinema","name":["السينما والأفلام","Cinema and film"],"meaning":["تُغلق ذراع اللوح وتُفتح مرة واحدة ويضيء رمز التشغيل: بداية لقطة.","The clapper arm closes and reopens once and the play mark lights: a take begins."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"board","items":[{"el":"rect","x":7,"y":18,"width":34,"height":22,"rx":2.5,"role":"body"},{"el":"path","d":"M7 23.5H41","role":"detail"}]},{"part":"arm","items":[{"el":"path","d":"M7 17.5V12.6H40.5V17.5Z","role":"body"},{"el":"path","d":"M12 17.5L15 12.6M19 17.5L22 12.6M26 17.5L29 12.6M33 17.5L36 12.6","role":"detail"}],"transform":"rotate(-12 7 17.5)"},{"part":"play","items":[{"el":"path","d":"M21 26.5V36.5L29.5 31.5Z","role":"accentBody"}]}],"motion":{"name":"clap","durationMs":640,"easing":"emphasized","tracks":[{"part":"arm","prop":"rotate","origin":[7,17.5],"keys":[-12,0,-12],"offsets":[0,0.35,1]},{"part":"play","prop":"scale","origin":[25,31.5],"keys":[1,1.14,1],"delayMs":200,"durationMs":380}]},"hover":{"kind":"scan"}},{"id":"problem","name":["المشكلة","Problem"],"meaning":["تنبض حافة اللوح مرة واحدة: مشكلة محددة تستحق الحل.","The plate edge pulses once: a defined problem worth solving."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"plate","items":[{"el":"path","d":"M17.5 8H30.5L40 17.5V30.5L30.5 40H17.5L8 30.5V17.5Z","role":"body"}]},{"part":"mark","items":[{"el":"path","d":"M24 15.5V26.5","role":"accent"},{"el":"circle","cx":24,"cy":32,"r":1.8,"role":"accentFill"}]}],"motion":{"name":"alert","durationMs":640,"easing":"emphasized","tracks":[{"part":"plate","prop":"scale","origin":[24,24],"keys":[1,1.07,1]},{"part":"mark","prop":"opacity","keys":[1,0.35,1]}],"keyline":"square"},"hover":{"kind":"pulse","part":"mark","origin":[24,24]}},{"id":"inputs","name":["المدخلات","Inputs"],"meaning":["يدخل السهم إلى الحاوية: بيانات تصل إلى المسار.","The arrow drops into the tray: data arriving on the path."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"tray","items":[{"el":"path","d":"M6.5 27.5H15.5L18.5 32.5H29.5L32.5 27.5H41.5V38A2.5 2.5 0 0 1 39 40.5H9A2.5 2.5 0 0 1 6.5 38Z","role":"body"}]},{"part":"arrow","items":[{"el":"path","d":"M24 6.5V24M18.5 18.5L24 24L29.5 18.5","role":"accent"}]}],"motion":{"name":"ingest","durationMs":640,"easing":"emphasized","tracks":[{"part":"arrow","prop":"translate","keys":[[0,-5],[0,0]]},{"part":"arrow","prop":"opacity","keys":[0,1],"durationMs":260}],"keyline":"square"},"hover":{"kind":"lift","parts":["arrow"]}},{"id":"decision","name":["القرار","Decision"],"meaning":["يُرسم الفرع المختار وحده: قرار له مسار واضح.","Only the chosen branch is drawn: a decision with one clear path."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"gate","items":[{"el":"path","d":"M24 6L37.5 19.5L24 33L10.5 19.5Z","role":"body"},{"el":"circle","cx":24,"cy":19.5,"r":2.2,"role":"accentFill"}]},{"part":null,"items":[{"el":"path","d":"M24 33L15 41.5","role":"detail"},{"el":"circle","cx":15,"cy":41.5,"r":1.6,"role":"detail"}]},{"part":"branch","items":[{"el":"path","d":"M24 33L33 41.5","role":"accent","pathLength":1}]},{"part":"end","items":[{"el":"circle","cx":33,"cy":41.5,"r":1.9,"role":"accentFill"}]}],"motion":{"name":"choose","durationMs":700,"easing":"emphasized","tracks":[{"part":"branch","prop":"draw","keys":[1,0],"durationMs":460},{"part":"end","prop":"scale","origin":[33,41.5],"keys":[0,1.4,1],"delayMs":400,"durationMs":300}],"keyline":"square"},"hover":{"kind":"trace","part":"branch"}},{"id":"result","name":["النتيجة","Result"],"meaning":["يصل السهم إلى الهدف وتنبض الحلقات مرة: نتيجة مقاسة على هدفها.","The arrow reaches the target and the rings pulse once: a result measured against its target."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"rings","items":[{"el":"circle","cx":24,"cy":24,"r":15,"role":"line"},{"el":"circle","cx":24,"cy":24,"r":9.5,"role":"body"},{"el":"circle","cx":24,"cy":24,"r":4,"role":"accentFill"}]},{"part":"arrow","items":[{"el":"path","d":"M41 7L26.8 21.2M36.5 7H41V11.5","role":"accent"}]}],"motion":{"name":"hit","durationMs":700,"easing":"emphasized","tracks":[{"part":"arrow","prop":"translate","keys":[[5,-5],[0,0]],"durationMs":360},{"part":"rings","prop":"scale","origin":[24,24],"keys":[1,1.08,1],"delayMs":300,"durationMs":400}]},"hover":{"kind":"pulse","part":"rings","origin":[24,24]}},{"id":"home","name":["الرئيسية","Home"],"meaning":["يستقر السقف ويضيء الباب مرة واحدة: نقطة البداية.","The roof settles and the door lights once: the starting point."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"roof","items":[{"el":"path","d":"M7 22L24 8.5L41 22","role":"line"}]},{"part":"house","items":[{"el":"path","d":"M14.5 20H33.5L36 22.5V38L33.5 40.5H14.5L12 38V22.5Z","role":"body"}]},{"part":"door","items":[{"el":"rect","x":20.5,"y":28.5,"width":7,"height":12,"rx":1.5,"role":"accentBody"}]}],"motion":{"name":"arrive","durationMs":700,"easing":"emphasized","tracks":[{"part":"roof","prop":"translate","keys":[[0,-2.5],[0,0]],"durationMs":420},{"part":"door","prop":"opacity","keys":[0.3,1],"delayMs":260,"durationMs":380}],"keyline":"square"},"hover":{"kind":"lift","parts":["roof"]}},{"id":"workflows","name":["مسارات العمل","Workflows"],"meaning":["تعبر نقطة بيانات المسار من محطة إلى محطة: سير عمل محدد الاتجاه.","A data point crosses the path from station to station: a directed workflow."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"path","items":[{"el":"path","d":"M10 18.5V24H19.5M28.5 24H38V29.5M34.6 26.6L38 30L41.4 26.6","role":"line"}]},{"part":"n0","items":[{"el":"circle","cx":10,"cy":14,"r":4.5,"role":"body"}]},{"part":"n1","items":[{"el":"circle","cx":24,"cy":24,"r":4.5,"role":"accentBody"}]},{"part":"n2","items":[{"el":"circle","cx":38,"cy":34.5,"r":4.5,"role":"body"}]},{"part":"packet","items":[{"el":"circle","cx":10,"cy":21,"r":1.8,"role":"ghost"}]}],"motion":{"name":"flow","durationMs":1000,"easing":"inout","tracks":[{"part":"packet","prop":"translate","keys":[[0,0],[0,3],[9.5,3],[28,3],[28,8.5]],"offsets":[0,0.15,0.4,0.8,1]},{"part":"packet","prop":"opacity","keys":[0,1,1,0],"offsets":[0,0.1,0.85,1]},{"part":"n2","prop":"scale","origin":[38,34.5],"keys":[1,1.2,1],"delayMs":760,"durationMs":300}],"keyline":"square"},"hover":{"kind":"trace","part":"path"}},{"id":"capabilities","name":["القدرات","Capabilities"],"meaning":["ترتفع البلاطات واحدة بعد أخرى: قدرات مستقلة تعمل معًا.","The tiles lift one after another: separate capabilities working together."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"t0","items":[{"el":"path","d":"M11 8H19L22 11V19L19 22H11L8 19V11Z","role":"body"}]},{"part":"t1","items":[{"el":"path","d":"M29 8H37L40 11V19L37 22H29L26 19V11Z","role":"accentBody"}]},{"part":"t2","items":[{"el":"path","d":"M11 26H19L22 29V37L19 40H11L8 37V29Z","role":"body"}]},{"part":"t3","items":[{"el":"path","d":"M29 26H37L40 29V37L37 40H29L26 37V29Z","role":"body"}]}],"motion":{"name":"assemble","durationMs":760,"easing":"emphasized","tracks":[{"part":"t0","prop":"translate","keys":[[0,0],[0,-1.8],[0,0]],"durationMs":380},{"part":"t1","prop":"translate","keys":[[0,0],[0,-1.8],[0,0]],"delayMs":120,"durationMs":380},{"part":"t2","prop":"translate","keys":[[0,0],[0,-1.8],[0,0]],"delayMs":240,"durationMs":380},{"part":"t3","prop":"translate","keys":[[0,0],[0,-1.8],[0,0]],"delayMs":360,"durationMs":380}],"keyline":"square"},"hover":{"kind":"lift","parts":["t1","t3"]}},{"id":"briefing","name":["الإحاطة التنفيذية","Executive briefing"],"meaning":["يمتلئ خط التقدم مرة واحدة: إحاطة قصيرة لها بداية ونهاية.","The progress line fills once: a short briefing with a start and an end."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"screen","items":[{"el":"rect","x":6,"y":9,"width":36,"height":24,"rx":2.5,"role":"body"},{"el":"path","d":"M24 33V39M16 39.5H32","role":"line"}]},{"part":"play","items":[{"el":"path","d":"M20.5 15.5V26.5L29.5 21Z","role":"accentBody"}]},{"part":"track","items":[{"el":"path","d":"M10 29.5H38","role":"detail"}]},{"part":"progress","items":[{"el":"path","d":"M10 29.5H26","role":"accent"}]}],"motion":{"name":"progress","durationMs":900,"easing":"inout","tracks":[{"part":"progress","prop":"scale","origin":[10,29.5],"keys":[[0.05,1],[1,1]]},{"part":"play","prop":"scale","origin":[24,21],"keys":[1,1.12,1],"durationMs":420}],"keyline":"landscape"},"hover":{"kind":"scan"}},{"id":"company","name":["الشركة والتواصل","Company and contact"],"meaning":["تظهر فقاعة الرسالة من الاستوديو: باب التواصل مفتوح.","A message bubble rises from the studio: the door to contact is open."],"keyline":"circle","mirrorInRtl":false,"groups":[{"part":"building","items":[{"el":"path","d":"M10.5 14H25.5L28 16.5V38.5L25.5 41H10.5L8 38.5V16.5Z","role":"body"},{"el":"path","d":"M12.5 20.5H23.5M12.5 26H23.5M12.5 31.5H23.5","role":"detail"},{"el":"path","d":"M8 41H40","role":"line"}]},{"part":"bubble","items":[{"el":"path","d":"M27 8H40A2.5 2.5 0 0 1 42.5 10.5V18.5A2.5 2.5 0 0 1 40 21H33L29.5 24.5V21H27A2.5 2.5 0 0 1 24.5 18.5V10.5A2.5 2.5 0 0 1 27 8Z","role":"accentBody"},{"el":"path","d":"M29 13.5H38M29 16.5H35","role":"accent"}]}],"motion":{"name":"reach","durationMs":700,"easing":"emphasized","tracks":[{"part":"bubble","prop":"scale","origin":[29.5,24.5],"keys":[0.6,1.08,1]},{"part":"bubble","prop":"opacity","keys":[0,1],"durationMs":260}]},"hover":{"kind":"pulse","part":"bubble","origin":[29.5,24.5]}}]}; })(typeof window !== 'undefined' ? window : globalThis);

;
 
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SQDS = api;
}(typeof window !== 'undefined' ? window : this, function (W) {
  'use strict';

  var D = W.document;
  var VERSION = '1.1.0';
  var NS = 'http://www.w3.org/2000/svg';
  var mqReduce = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var mqFine = W.matchMedia ? W.matchMedia('(hover: hover) and (pointer: fine)') : { matches: false };
  var uid = 0;
  function nextId(p) { uid += 1; return (p || 'sqds') + '-' + uid; }
  function reduced() { return !!mqReduce.matches || D.documentElement.getAttribute('data-sqds-motion') === 'reduce'; }
  function finePointer() { return !!mqFine.matches; }

   
  function langOf(node) {
    var n = node && node.closest ? node.closest('[lang]') : null;
    var l = (n && n.getAttribute('lang')) || D.documentElement.getAttribute('lang') || 'en';
    return l.slice(0, 2).toLowerCase() === 'ar' ? 'ar' : 'en';
  }
  function dirOf(node) {
    try { return W.getComputedStyle(node).direction === 'rtl' ? 'rtl' : 'ltr'; } catch (e) { return 'ltr'; }
  }
  function P(pair, lang) {
    if (pair == null) return '';
    if (!Array.isArray(pair)) return String(pair);
    var v = pair[lang === 'ar' ? 0 : 1];
    return v == null ? String(pair[0] == null ? '' : pair[0]) : String(v);
  }
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  function digits(s, lang) {
    s = String(s);
    if (lang !== 'ar') return s;
    return s.replace(/(\d)\.(\d)/g, '$1٫$2').replace(/[0-9]/g, function (d) { return AR_DIGITS[d]; });
  }
   
  function round(n, d) { var f = Math.pow(10, d || 0); return Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9) / f; }
  function format(n, opts) {
    opts = opts || {};
    var lang = opts.lang || 'en', d = opts.decimals || 0;
    var s = round(n, d).toFixed(d);
    if (opts.percent) s += lang === 'ar' ? '٪' : '%';
    return digits(s, lang);
  }

   
  function h(tag, attrs) {
    var e = D.createElement(tag);
    setAttrs(e, attrs);
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function s(tag, attrs) {
    var e = D.createElementNS(NS, tag);
    setAttrs(e, attrs);
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function setAttrs(e, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.setAttribute('class', v);
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (p) { e.style.setProperty(p, v[p]); });
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
  }
  function add(p, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { add(p, k); }); return; }
    p.appendChild(kid.nodeType ? kid : D.createTextNode(String(kid)));
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; }
  function cssVar(name, fallback) {
    var v = W.getComputedStyle(D.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function ms(name, fallback) {
    if (reduced()) return 0;
    var v = cssVar(name, '');
    if (!v) return fallback;
    var n = parseFloat(v);
    return /ms$/.test(v) ? n : n * 1000;
  }
  function ease(name) { return cssVar('--sqds-ease-' + name, 'cubic-bezier(.2, .7, .2, 1)'); }

   
  var live = new Set();
  function register(comp) {
    comp.el.__sqds = comp;
    live.add(comp);
    return comp;
  }
  function relabel(scope) {
    live.forEach(function (c) {
      if (!c.el.isConnected) return;
      if (!scope || scope === D || scope.contains(c.el)) c.relabel();
    });
  }
  if (W.MutationObserver) {
    new W.MutationObserver(function () { relabel(D); }).observe(D.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  }

   
  function bezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function sx(t) { return ((ax * t + bx) * t + cx) * t; }
    function sy(t) { return ((ay * t + by) * t + cy) * t; }
    function dx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x, i;
      for (i = 0; i < 8; i++) { var e = sx(t) - x; if (Math.abs(e) < 1e-6) return sy(t); var d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
      var lo = 0, hi = 1; t = x;
      for (i = 0; i < 30; i++) { var v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (x > v) lo = t; else hi = t; t = (lo + hi) / 2; }
      return sy(t);
    };
  }
  function easeFn(name) {
    var m = /cubic-bezier\(([^)]+)\)/.exec(ease(name));
    if (!m) return function (x) { return x; };
    var a = m[1].split(',').map(parseFloat);
    return bezier(a[0], a[1], a[2], a[3]);
  }
   
  function tween(from, to, opts, step) {
    opts = opts || {};
    var dur = opts.duration != null ? opts.duration : ms('--sqds-dur-data', 900);
    if (reduced() || dur <= 0 || from === to || !isFinite(from)) { step(to, 1); if (opts.done) opts.done(); return { cancel: function () {} }; }
    var f = easeFn(opts.easing || 'data'), t0 = null, raf = 0, dead = false;
    function frame(now) {
      if (dead) return;
      if (t0 === null) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      step(p >= 1 ? to : from + (to - from) * f(p), p);
      if (p < 1) raf = W.requestAnimationFrame(frame); else if (opts.done) opts.done();
    }
    raf = W.requestAnimationFrame(frame);
    return { cancel: function () { dead = true; W.cancelAnimationFrame(raf); } };
  }

   
  var STATUS = {
    verified:     { label: ['مثبت', 'Verified'], help: ['أُعيد حسابه أو فحصه ويمكن تكراره', 'Recomputed or re-checked, and repeatable'], marker: 'check', level: 5, signal: true },
    demonstrated: { label: ['مُبيَّن عمليًا', 'Demonstrated'], help: ['شوهد يعمل مرة على الأقل وله سجل مؤرخ، دون إعادة تحقق مستقلة', 'Seen working at least once, with a dated record; not independently re-checked'], marker: 'play', level: 4 },
    demo:         { label: ['عرض توضيحي', 'Demo'], help: ['عرض توضيحي لطريقة العمل، لا نتيجة مقاسة', 'A demonstration of the method, not a measured result'], marker: 'play', level: 4 },
    simulated:    { label: ['محاكاة', 'Simulated'], help: ['بيانات اصطناعية أو إعادة تمثيل', 'Synthetic data or a reenactment'], marker: 'diamond', level: 3 },
    planned:      { label: ['مخطط', 'Planned'], help: ['تصميم أو هدف أو طريقة لم تُنفَّذ بعد', 'A design, a target or a method not yet run'], marker: 'ring', level: 2 },
    unverified:   { label: ['غير متحقَّق منه', 'Unverified'], help: ['لا شيء هنا يثبته بعد', 'Nothing here proves it yet'], marker: 'dash', level: 1 },
    pending:      { label: ['قيد المراجعة', 'Under review'], help: ['لا يُحسب ولا يُعتمد حتى تكتمل مدخلاته', 'Not calculated or approved until its inputs are complete'], marker: 'hold', level: 0 },
  };
  var LADDER = ['unverified', 'planned', 'simulated', 'demonstrated', 'verified'];
  var MARKER = {
    check: 'M2.5 6.2l2.2 2.2L9.6 3.6',
    play: 'M3.6 2.6v6.8L9.2 6z',
    diamond: 'M6 1.8L10.2 6 6 10.2 1.8 6z',
    ring: 'M6 2.2a3.8 3.8 0 1 1 0 7.6a3.8 3.8 0 1 1 0-7.6z',
    dash: 'M2.6 6h6.8',
    hold: 'M3.4 2.4h5.2M3.4 9.6h5.2M4 2.4c0 2.4 4 2.4 4 3.6S4 7.2 4 9.6M8 2.4c0 1.2-1 1.8-2 2.4',
  };
  function markerSvg(kind) {
    return s('svg', { class: 'sqds-chip__mark', viewBox: '0 0 12 12', 'aria-hidden': 'true', focusable: 'false' }, s('path', { d: MARKER[kind] || MARKER.dash }));
  }

   
  function chip(status, opts) {
    opts = opts || {};
    var st = STATUS[status] || STATUS.unverified;
    var el = h('span', { class: 'sqds-chip' + (opts.size === 'lg' ? ' sqds-chip--lg' : ''), 'data-status': STATUS[status] ? status : 'unverified', 'data-sqds': 'chip' });
    if (st.signal) el.setAttribute('data-signal', 'verified');
    var txt = h('span', { class: 'sqds-chip__t' });
    el.append(markerSvg(st.marker), txt);
    var comp = {
      el: el, status: status,
      relabel: function () {
        var l = langOf(el);
        txt.textContent = opts.label ? P(opts.label, l) : P(st.label, l);
        el.title = P(opts.help || st.help, l);
      },
      destroy: function () { live.delete(comp); },
    };
    comp.relabel();
    return register(comp);
  }

   
  var ICONSET = W.SQDS_ICONS || { icons: [], paint: {} };
  var ICON = {};
  (ICONSET.icons || []).forEach(function (ic) { ICON[ic.id] = ic; });
  var SKIP = { el: 1, role: 1, part: 1, fillRule: 1, pathLength: 1, id: 1 };

   
  function icon(id, opts) {
    opts = opts || {};
    var def = ICON[id];
    if (!def) throw new Error('SQDS: unknown icon ' + id);
    var gid = nextId('sqds-ig');
    var svg = s('svg', { class: 'sqds-icon', viewBox: '0 0 48 48', 'data-icon': id, focusable: 'false', 'data-sqds-variant': opts.variant || null, 'data-signal': opts.signal || null });
    if (opts.size) svg.style.setProperty('--sqds-icon-size', typeof opts.size === 'number' ? opts.size + 'px' : opts.size);
    var glass = ICONSET.paint && ICONSET.paint.glass, LY = ICONSET.layers || null;
    var full = LY && opts.detail !== 'lite' && !(opts.size && opts.size < 32) && opts.variant !== 'c';
    svg.setAttribute('data-detail', full ? 'full' : 'lite');
    function grad(tag, id, g) {
      var el = s(tag, tag === 'radialGradient' ? { id: id, cx: g.cx, cy: g.cy, r: g.r } : { id: id, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 });
      g.stops.forEach(function (st) { el.appendChild(s('stop', { offset: st[0], 'stop-color': st[1] })); });
      return el;
    }
    var defs = s('defs');
    if (glass) defs.appendChild(grad('linearGradient', gid, glass));
    if (full) { defs.appendChild(grad('radialGradient', gid + 'l', LY.light)); defs.appendChild(grad('linearGradient', gid + 's', LY.spec)); }
    svg.appendChild(defs);
    def.groups.forEach(function (grp) {
      var g = s('g', { 'data-part': grp.part || null, transform: grp.transform || null });
      grp.items.forEach(function (it) {
        var a = {};
        Object.keys(it).forEach(function (k) { if (!SKIP[k]) a[k] = it[k]; });
        function make(role) {
          var e = s(it.el, a);
          e.setAttribute('data-role', role);
          if (it.fillRule) e.setAttribute('fill-rule', it.fillRule);
          return e;
        }
         
        if (full && it.role === 'body') { var dp = make('depth'); dp.setAttribute('transform', 'translate(' + LY.depth.offset.join(' ') + ')'); g.appendChild(dp); }
        var e = make(it.role);
        if (it.pathLength) e.setAttribute('pathLength', it.pathLength);
        if (it.role === 'body') e.setAttribute('fill', 'url(#' + gid + ')');
        g.appendChild(e);
        if (full && it.role === 'body') {
          var li = make('light'); li.setAttribute('fill', 'url(#' + gid + 'l)'); g.appendChild(li);
          var sp = make('spec'); sp.setAttribute('stroke', 'url(#' + gid + 's)'); g.appendChild(sp);
        }
      });
      svg.appendChild(g);
    });
    var title = null;
    if (opts.label === false) svg.setAttribute('aria-hidden', 'true');
    else {
      svg.setAttribute('role', 'img');
      title = s('title');
      svg.insertBefore(title, svg.firstChild);
    }
    var comp = {
      el: svg, def: def,
      relabel: function () { if (title) title.textContent = P(opts.label || def.name, langOf(svg.parentNode || svg)); },
      play: function (o) { return playIcon(svg, o); },
      destroy: function () { live.delete(comp); },
    };
    comp.relabel();
    return register(comp).el;
  }

   
  function playIcon(svg, opts) {
    opts = opts || {};
    var def = ICON[svg.getAttribute('data-icon')];
    if (!def || !def.motion || !svg.animate) return Promise.resolve(false);
    if (reduced() && opts.at == null) return Promise.resolve(false);
    (svg.__anims || []).forEach(function (a) { a.cancel(); });
    var m = def.motion, anims = [];
    svg.setAttribute('data-anim', 'play');
    m.tracks.forEach(function (t) {
      var part = svg.querySelector('[data-part="' + t.part + '"]');
      if (!part) return;
      var dur = t.durationMs || m.durationMs, delay = t.delayMs || 0;
      var frames, target = part;
      if (t.origin) { part.style.transformBox = 'view-box'; part.style.transformOrigin = t.origin[0] + 'px ' + t.origin[1] + 'px'; }
      else if (t.prop === 'scale' || t.prop === 'rotate') { part.style.transformBox = 'fill-box'; part.style.transformOrigin = 'center'; }
      if (t.prop === 'rotate') frames = t.keys.map(function (k) { return { transform: 'rotate(' + k + 'deg)' }; });
      else if (t.prop === 'translate') frames = t.keys.map(function (k) { return { transform: 'translate(' + k[0] + 'px, ' + k[1] + 'px)' }; });
      else if (t.prop === 'scale') frames = t.keys.map(function (k) { return { transform: Array.isArray(k) ? 'scale(' + k[0] + ', ' + k[1] + ')' : 'scale(' + k + ')' }; });
      else if (t.prop === 'opacity') frames = t.keys.map(function (k) { return { opacity: k }; });
      else if (t.prop === 'draw') {
        var paths = part.querySelectorAll('[pathLength]');
        paths.forEach(function (p) { p.style.strokeDasharray = '1 1'; });
        frames = t.keys.map(function (k) { return { strokeDashoffset: k }; });
        target = paths;
      }
      if (!frames) return;
      if (t.offsets) frames.forEach(function (f, i) { f.offset = t.offsets[i]; });
      var easing = ease(t.easing || m.easing);
      var list = target instanceof W.NodeList ? Array.prototype.slice.call(target) : [target];
      list.forEach(function (node) {
        var a = node.animate(frames, { duration: dur, delay: delay, easing: easing, fill: 'backwards' });
        anims.push(a);
      });
    });
    svg.__anims = anims;
    if (opts.at != null) {
      anims.forEach(function (a) { a.pause(); a.currentTime = opts.at * m.durationMs; });
      return Promise.resolve(true);
    }
    return Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })).then(function () {
      svg.removeAttribute('data-anim');
      svg.querySelectorAll('[pathLength]').forEach(function (p) { p.style.strokeDasharray = ''; });
      return true;
    });
  }

   
  function hoverIcon(svg, kind) {
    var def = ICON[svg.getAttribute('data-icon')];
    if (!def || !svg.animate || reduced() || svg.__hovering || svg.getAttribute('data-anim')) return Promise.resolve(false);
    var hv = kind ? Object.assign({}, def.hover || {}, { kind: kind }) : def.hover;
    if (!hv) return Promise.resolve(false);
    svg.__hovering = true;
    var anims = [], tmp = [];
    var part = hv.part ? svg.querySelector('[data-part="' + hv.part + '"]') : null;
    var ez = ease('emphasized');
    if (hv.kind === 'trace') {
      var src = (part || svg).querySelector('path[data-role="body"], path[data-role="accent"], path[data-role="line"], path[data-role="accentBody"]') || svg.querySelector('path');
      if (src) {
        var tr = src.cloneNode(false);
        ['fill', 'fill-rule', 'stroke', 'transform'].forEach(function (a) { tr.removeAttribute(a); });
        tr.setAttribute('data-role', 'energy'); tr.setAttribute('pathLength', '1');
        src.parentNode.appendChild(tr); tmp.push(tr);
        anims.push(tr.animate([{ strokeDashoffset: 1, opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { strokeDashoffset: 0, opacity: 0 }], { duration: 720, easing: 'cubic-bezier(.65, 0, .35, 1)' }));
      }
    } else if (hv.kind === 'orbit' && part) {
      part.style.transformBox = 'view-box'; part.style.transformOrigin = hv.origin[0] + 'px ' + hv.origin[1] + 'px';
      anims.push(part.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + (hv.deg || 180) + 'deg)' }], { duration: 760, easing: ez }));
    } else if (hv.kind === 'lift') {
      (hv.parts || []).forEach(function (pn, i) {
        var pp = svg.querySelector('[data-part="' + pn + '"]');
        if (pp) anims.push(pp.animate([{ transform: 'translate(0, 0)' }, { transform: 'translate(0, -1.6px)', offset: 0.45 }, { transform: 'translate(0, 0)' }], { duration: 560, delay: i * 70, easing: ez }));
      });
    } else if (hv.kind === 'scan') {
      var beam = s('line', { x1: 6, y1: 6, x2: 42, y2: 6, 'data-role': 'scan' });
      svg.appendChild(beam); tmp.push(beam);
      anims.push(beam.animate([{ transform: 'translateY(0)', opacity: 0 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0.9, offset: 0.8 }, { transform: 'translateY(36px)', opacity: 0 }], { duration: 760, easing: 'cubic-bezier(.4, 0, .2, 1)' }));
    } else if (hv.kind === 'pulse') {
      var tgt = part || svg.querySelector('[data-part]');
      if (tgt) {
        tgt.style.transformBox = hv.origin ? 'view-box' : 'fill-box';
        tgt.style.transformOrigin = hv.origin ? hv.origin[0] + 'px ' + hv.origin[1] + 'px' : 'center';
        anims.push(tgt.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 520, easing: ez }));
      }
    }
    return Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })).then(function () {
      tmp.forEach(function (n) { n.remove(); });
      svg.__hovering = false;
      return true;
    });
  }
   
  var HOSTS = '.sqds-icon-host, .sqds-card, .sqds-wf__node, .sqds-btn, .sqds-scn__step, [data-sqds-icon-host]';
  function hostEnter(host) { var list = host.querySelectorAll('svg.sqds-icon'); for (var i = 0; i < list.length && i < 3; i++) hoverIcon(list[i]); }
  D.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse') return;
    var host = e.target.closest && e.target.closest(HOSTS);
    if (host && !(e.relatedTarget && host.contains(e.relatedTarget))) hostEnter(host);
  });
  D.addEventListener('focusin', function (e) {
    var host = e.target.closest && e.target.closest(HOSTS);
    if (host && e.target.matches(':focus-visible')) hostEnter(host);
  });

   
  var CHEVRON = 'M9 6l6 6-6 6';
  function glyph(d, cls) { return s('svg', { class: 'sqds-glyph' + (cls ? ' ' + cls : ''), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, s('path', { d: d })); }

   
  function button(opts) {
    opts = opts || {};
    var kind = opts.kind || 'primary', size = opts.size || 'md';
    var el = h(opts.href ? 'a' : 'button', {
      class: 'sqds-btn sqds-btn--' + kind + ' sqds-btn--' + size, 'data-sqds': 'button', 'data-sqds-variant': opts.variant || null,
      type: opts.href ? null : 'button', href: opts.href || null, disabled: opts.disabled || null, 'aria-disabled': opts.href && opts.disabled ? 'true' : null,
    });
    var lab = h('span', { class: 'sqds-btn__label' });
    if (opts.icon) el.appendChild(icon(opts.icon, { label: false, size: size === 'lg' ? 22 : 20 }));
    el.appendChild(lab);
    if (opts.trailing) el.appendChild(glyph(CHEVRON, 'sqds-glyph--dir'));
    if (opts.onClick) el.addEventListener('click', opts.onClick);
    var stopMag = opts.magnetic && size === 'lg' ? magnetic(el, { max: 6 }) : null;
    var comp = {
      el: el,
      relabel: function () { lab.textContent = P(opts.label, langOf(el)); },
      destroy: function () { if (stopMag) stopMag(); live.delete(comp); },
    };
    comp.relabel();
    return register(comp);
  }

   
  function magnetic(el, o) {
    o = o || {};
    var max = o.max || 6, pull = o.pull || 0.22, raf = 0, active = false, px = 0, py = 0;
    function apply() {
      raf = 0;
      if (!active) { el.style.translate = ''; return; }
      var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = Math.max(-max, Math.min(max, (px - cx) * pull)), dy = Math.max(-max * 0.6, Math.min(max * 0.6, (py - cy) * pull));
      el.style.translate = dx.toFixed(2) + 'px ' + dy.toFixed(2) + 'px';
    }
    function move(e) {
      if (!finePointer() || reduced() || e.pointerType !== 'mouse') return;
      active = true; px = e.clientX; py = e.clientY;
      if (!raf) raf = W.requestAnimationFrame(apply);
    }
    function leave() { active = false; if (!raf) raf = W.requestAnimationFrame(apply); }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.setAttribute('data-magnetic', '');
    return function () { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); el.style.translate = ''; };
  }

   
  var T = {
    details: ['التفاصيل', 'Details'], close: ['إغلاق التفاصيل', 'Close details'], example: ['مثال عملي', 'Practical example'],
    capability: ['القدرة', 'Capability'],
  };
  var MATERIAL = { a: 'crystal', b: 'optical', c: 'titanium' };

   
  function card(spec) {
    spec = spec || {};
    var variant = spec.variant || defaults.card;
    var id = spec.id || nextId('sqds-card');
    var titleId = id + '-t', detId = id + '-d';
    var hl = Math.min(6, Math.max(2, spec.headingLevel || 3));
    var el = h('article', { class: 'sqds-card', id: id, 'data-sqds': 'card', 'data-sqds-variant': variant, 'data-state': 'rest', 'data-status': spec.status || null, 'aria-labelledby': titleId });
    var shadow = h('div', { class: 'sqds-card__shadow', 'aria-hidden': 'true' });
    var surface = h('div', { class: 'sqds-card__surface sqds-mat-' + (spec.material || MATERIAL[variant] || 'crystal') });
    var glare = h('span', { class: 'sqds-card__glare', 'aria-hidden': 'true' });
    var ic = spec.icon ? icon(spec.icon, { label: false, variant: variant, signal: spec.status === 'verified' ? 'verified' : null }) : null;
    var iconWell = h('div', { class: 'sqds-card__icon', 'aria-hidden': 'true' }, ic);
     
    var i3 = spec.icon && W.SITE && W.SITE.icons3d ? W.SITE.icons3d[spec.icon] : null;
    if (i3 && i3.webp) {
      var still3 = h('img', { class: 'sqds-card__icon3d', src: i3.webp, alt: '', width: '72', height: '72', loading: 'lazy', decoding: 'async' });
      still3.addEventListener('error', function () { iconWell.classList.remove('has-3d'); still3.remove(); });
      iconWell.classList.add('has-3d');
      iconWell.appendChild(still3);
    }
    var kicker = spec.kicker ? h('p', { class: 'sqds-card__kicker sqds-eyebrow' }) : null;
    var title = h('h' + hl, { class: 'sqds-card__title', id: titleId });
    var cap = h('p', { class: 'sqds-card__cap' });
    var exLabel = h('span', { class: 'sqds-card__ex-label' }), exText = h('span', { class: 'sqds-card__ex-text' });
    var ex = spec.example ? h('p', { class: 'sqds-card__ex' }, exLabel, exText) : null;
    var chipComp = spec.status ? chip(spec.status, { label: spec.statusLabel }) : null;
    var btnLabel = h('span', { class: 'sqds-btn__label' }), btnHidden = h('span', { class: 'sqds-vh' });
    var toggle = h('button', { type: 'button', class: 'sqds-btn sqds-btn--tertiary sqds-btn--md sqds-card__toggle', 'aria-expanded': 'false', 'aria-controls': detId, 'data-sqds-variant': variant },
      btnLabel, btnHidden, glyph('M6 9l6 6 6-6', 'sqds-card__chev'));
    var detInner = h('div', { class: 'sqds-card__details-inner' });
    var details = h('div', { class: 'sqds-card__details', id: detId, role: 'region', 'aria-labelledby': titleId, inert: '' }, h('div', { class: 'sqds-card__details-clip' }, detInner));
    var foot = h('div', { class: 'sqds-card__foot' }, chipComp ? chipComp.el : null, toggle);
     
    var scn = spec.scenario && W.SQDS && W.SQDS.scenario ? W.SQDS.scenario(Object.assign({ variant: variant, replay: false }, spec.scenario)) : null;
    var meta = variant === 'c' ? h('p', { class: 'sqds-card__meta sqds-mono' }) : null;
    surface.append(glare, h('div', { class: 'sqds-card__content' }, h('div', { class: 'sqds-card__head' }, iconWell, h('div', { class: 'sqds-card__heading' }, kicker, title)), meta, cap, ex, scn ? scn.el : null, foot, details));
    el.append(shadow, surface);
    var expanded = false, focusOn = false, lastPointer = 'mouse';
    if (i3 && i3.webp && (i3['-loopwebm'] || i3['-loopmp4'])) {
      var loop3 = null, hoverOK = W.matchMedia ? W.matchMedia('(hover: hover) and (pointer: fine)') : { matches: false };
      var play3 = function () {
        if (reduced() || !iconWell.classList.contains('has-3d')) return;
        if (!loop3) {
          loop3 = h('video', { class: 'sqds-card__icon3d-loop', muted: '', playsinline: '', preload: 'none', 'aria-hidden': 'true', tabindex: '-1' });
          loop3.muted = true;
          loop3.addEventListener('ended', function () { iconWell.classList.remove('is-playing'); });
          if (i3['-loopwebm']) loop3.appendChild(h('source', { src: i3['-loopwebm'], type: 'video/webm' }));
          if (i3['-loopmp4']) loop3.appendChild(h('source', { src: i3['-loopmp4'], type: 'video/mp4' }));
          iconWell.appendChild(loop3);
        }
        if (iconWell.classList.contains('is-playing')) return;
        try { loop3.currentTime = 0; } catch (e) {}
        iconWell.classList.add('is-playing');
        var pr = loop3.play(); if (pr && pr.catch) pr.catch(function () { iconWell.classList.remove('is-playing'); });
      };
      var stop3 = function () { iconWell.classList.remove('is-playing'); if (loop3) { loop3.pause(); try { loop3.currentTime = 0; } catch (e) {} } };
      el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && hoverOK.matches) play3(); });
      el.addEventListener('pointerleave', stop3);
      el.addEventListener('focusin', play3);
      el.addEventListener('focusout', function (e) { if (!el.contains(e.relatedTarget)) stop3(); });
    }

    function renderDetails(l) {
      clear(detInner);
      var d = spec.details;
      if (typeof d === 'function') add(detInner, d(l));
      else if (d && d.nodeType) detInner.appendChild(d);
      else if (d) {
        (Array.isArray(d) && Array.isArray(d[0]) ? d : [d]).forEach(function (pair) { detInner.appendChild(h('p', { class: 'sqds-card__detail-p' }, P(pair, l))); });
      }
    }
    function scope() { return el.closest('.sqds-focus-scope'); }
    function setFocusMode(on) {
      var sc = scope();
      focusOn = !!on && !!sc;
      el.toggleAttribute('data-focus', focusOn);
      if (!sc) return;
      if (focusOn) {
        sc.querySelectorAll('.sqds-card[data-focus]').forEach(function (o) { if (o !== el && o.__sqds) o.__sqds.toggle(false); });
        sc.setAttribute('data-sqds-focus', 'on');
        var veil = sc.querySelector(':scope > .sqds-focus-veil');
        if (!veil) { veil = h('div', { class: 'sqds-focus-veil', 'aria-hidden': 'true' }); veil.addEventListener('click', function () { var f = sc.querySelector('.sqds-card[data-focus]'); if (f && f.__sqds) f.__sqds.toggle(false, { restoreFocus: true }); }); sc.appendChild(veil); }
      } else if (!sc.querySelector('.sqds-card[data-focus]')) sc.removeAttribute('data-sqds-focus');
    }
     
    function toggle_(want, o) {
      o = o || {};
      var next = want == null ? !expanded : !!want;
      if (next === expanded) return;
      var before = el.getBoundingClientRect().top;
       
      var se = D.scrollingElement || D.documentElement;
      se.style.overflowAnchor = 'none';
      W.clearTimeout(el.__anchorT);
      el.__anchorT = W.setTimeout(function () { se.style.overflowAnchor = ''; }, ms('--sqds-spring-gentle-dur', 680) + 120);
      expanded = next;
      el.setAttribute('data-state', expanded ? 'expanded' : 'rest');
      toggle.setAttribute('aria-expanded', String(expanded));
      if (expanded) { details.removeAttribute('inert'); }
      else {
        if (details.contains(D.activeElement) || o.restoreFocus) toggle.focus({ preventScroll: true });
        details.setAttribute('inert', '');
      }
      setFocusMode(expanded && spec.focusMode !== false);
      var after = el.getBoundingClientRect().top;
      if (Math.abs(after - before) > 0.5) W.scrollBy(0, after - before);
      if (expanded && ic && !o.silent) playIcon(ic);
      relabelToggle();
      if (spec.onToggle) spec.onToggle(expanded);
    }
    function relabelToggle() {
      var l = langOf(el);
      btnLabel.textContent = P(expanded ? T.close : (spec.detailsLabel || T.details), l);
      btnHidden.textContent = (l === 'ar' ? '، ' : ': ') + P(spec.title, l);
    }
    toggle.addEventListener('click', function () { toggle_(); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && expanded) { e.stopPropagation(); toggle_(false, { restoreFocus: true }); }
    });
     
    el.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType || 'mouse'; });
    el.addEventListener('click', function (e) {
      if (lastPointer !== 'touch' && lastPointer !== 'pen') return;
      if (e.target.closest('a, button, input, select, textarea, summary, [tabindex], .sqds-card__details')) return;
      toggle_();
    });
     
    var raf = 0, gx = 0, gy = 0;
    function glareFrame() {
      raf = 0;
      var r = surface.getBoundingClientRect();
      glare.style.transform = 'translate3d(' + (gx - r.left - r.width).toFixed(1) + 'px,' + (gy - r.top - r.height).toFixed(1) + 'px,0)';
    }
    el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && finePointer() && !reduced()) el.classList.add('is-lit'); });
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !finePointer() || reduced()) return;
      gx = e.clientX; gy = e.clientY;
      if (!raf) raf = W.requestAnimationFrame(glareFrame);
    });
    el.addEventListener('pointerleave', function () { el.classList.remove('is-lit'); });

    var comp = {
      el: el, toggle: toggle_, get expanded() { return expanded; }, icon: ic, button: toggle,
      relabel: function () {
        var l = langOf(el);
        if (kicker) kicker.textContent = P(spec.kicker, l);
        title.textContent = P(spec.title, l);
        cap.textContent = P(spec.capability, l);
        if (ex) { exLabel.textContent = P(spec.exampleLabel || T.example, l); exText.textContent = P(spec.example, l); }
        if (meta) meta.textContent = (spec.ref ? spec.ref + ' · ' : '') + P((STATUS[spec.status] || STATUS.unverified).label, l);
        renderDetails(l);
        relabelToggle();
      },
      destroy: function () { live.delete(comp); if (chipComp) chipComp.destroy(); },
    };
    comp.relabel();
    return register(comp);
  }

   
  function figure(kind, variant, extraClass) {
    var el = h('figure', { class: 'sqds-inst sqds-inst--' + kind + (extraClass ? ' ' + extraClass : ''), 'data-sqds': kind, 'data-sqds-variant': variant });
    return el;
  }
  function polar(cx, cy, r, deg) { var a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function arcD(cx, cy, r, a0, a1) {
    if (a1 - a0 >= 359.99) a1 = a0 + 359.99;
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }
  var IT = { review: ['قيد المراجعة', 'Under review'], of: ['من', 'of'], table: ['عرض الجدول', 'Show table'], hideTable: ['إخفاء الجدول', 'Hide table'], value: ['القيمة', 'Value'], scenario: ['السيناريو', 'Scenario'] };

   
  function gauge(o) {
    o = Object.assign({ max: 100, state: 'ok', variant: defaults.gauge }, o);
    var v = o.variant, el = figure('gauge', v);
    var geo = v === 'c' ? { a0: 180, sweep: 180, r: 80, cx: 100, cy: 100, vb: '0 0 200 160' } : v === 'b' ? { a0: -90, sweep: 360, r: 76, cx: 100, cy: 100, vb: '0 0 200 200' } : { a0: 135, sweep: 270, r: 78, cx: 100, cy: 100, vb: '0 0 200 200' };
    var svg = s('svg', { class: 'sqds-gauge__svg', viewBox: geo.vb, 'aria-hidden': 'true', focusable: 'false' });
    var track = s('path', { class: 'sqds-gauge__track', d: arcD(geo.cx, geo.cy, geo.r, geo.a0, geo.a0 + geo.sweep) });
    var arcP = s('path', { class: 'sqds-gauge__value', pathLength: 100, d: arcD(geo.cx, geo.cy, geo.r, geo.a0, geo.a0 + geo.sweep) });
    var ticks = s('g', { class: 'sqds-gauge__ticks' });
    var n = v === 'c' ? 4 : 10;
    for (var i = 0; i <= n; i++) {
      var a = geo.a0 + geo.sweep * i / n, major = v === 'c' || i % 5 === 0;
      if (v === 'b' && i === n) break;
      var p0 = polar(geo.cx, geo.cy, geo.r + (v === 'c' ? -12 : 9), a), p1 = polar(geo.cx, geo.cy, geo.r + (v === 'c' ? -12 - (major ? 7 : 4) : 9 + (major ? 6 : 3)), a);
      ticks.appendChild(s('line', { x1: p0[0].toFixed(2), y1: p0[1].toFixed(2), x2: p1[0].toFixed(2), y2: p1[1].toFixed(2), class: major ? 'is-major' : null }));
    }
    var deco = s('g', { class: 'sqds-gauge__deco' });
    if (v === 'b') {
      deco.appendChild(s('ellipse', { cx: 100, cy: 100, rx: 94, ry: 30, transform: 'rotate(-20 100 100)' }));
      deco.appendChild(s('circle', { cx: 100, cy: 100, r: 62 }));
    }
    var sat = v === 'b' ? s('g', { class: 'sqds-gauge__sat' }, s('circle', { r: 9, class: 'halo' }), s('circle', { r: 4.6, class: 'core' })) : null;
    var needle = v === 'c' ? s('line', { class: 'sqds-gauge__needle', x1: geo.cx, y1: geo.cy, x2: geo.cx - geo.r + 18, y2: geo.cy }) : null;
    var scaleLbl = s('g', { class: 'sqds-gauge__scale' });
    svg.append(deco, track, ticks, arcP);
    if (sat) svg.appendChild(sat);
    if (needle) svg.append(needle, s('circle', { class: 'sqds-gauge__hub', cx: geo.cx, cy: geo.cy, r: 5 }));
    svg.appendChild(scaleLbl);
    var num = h('span', { class: 'sqds-gauge__num' }), unit = h('span', { class: 'sqds-gauge__unit' });
    var big = h('p', { class: 'sqds-gauge__big', 'aria-hidden': 'true' }, num, unit);
    var lbl = h('p', { class: 'sqds-gauge__label' });
    var center = h('div', { class: 'sqds-gauge__center' }, big, lbl);
    var meter = h('div', { class: 'sqds-gauge__meter' }, svg, center);
    var chipBox = h('div', { class: 'sqds-inst__foot' });
    var note = h('p', { class: 'sqds-inst__note' });
    var live_ = h('span', { class: 'sqds-vh', 'aria-live': 'polite' });
    el.append(meter, chipBox, note, live_);
    var shown = o.state === 'ok' ? Number(o.value) : 0, tw = null, chipComp = null;

    function draw(val) {
      var frac = Math.max(0, Math.min(1, val / o.max)), l = langOf(el);
      arcP.style.strokeDasharray = (frac * 100).toFixed(3) + ' 100';
      arcP.style.opacity = frac > 0.0005 && o.state === 'ok' ? 1 : 0;
      var ang = geo.a0 + geo.sweep * frac;
      if (sat) { var p = polar(geo.cx, geo.cy, geo.r, ang); sat.setAttribute('transform', 'translate(' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + ')'); sat.style.opacity = o.state === 'ok' ? 1 : 0; }
      if (needle) { needle.setAttribute('transform', 'rotate(' + (geo.sweep * frac).toFixed(2) + ' ' + geo.cx + ' ' + geo.cy + ')'); needle.style.opacity = o.state === 'ok' ? 1 : 0.25; }
      num.textContent = o.state === 'ok' ? format(val, { lang: l, decimals: o.decimals || 0 }) : P(IT.review, l);
    }
    function aria() {
      var l = langOf(el), label = P(o.label, l);
      if (o.state === 'ok') {
        meter.setAttribute('role', 'meter');
        meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', String(o.max)); meter.setAttribute('aria-valuenow', String(round(o.value, o.decimals || 0)));
        meter.setAttribute('aria-valuetext', format(o.value, { lang: l, decimals: o.decimals || 0, percent: o.unit === '%' }) + (o.status ? ' — ' + P(STATUS[o.status].label, l) : ''));
      } else {
        meter.setAttribute('role', 'img');
        ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'].forEach(function (a) { meter.removeAttribute(a); });
      }
      meter.setAttribute('aria-label', o.state === 'ok' ? label : label + ': ' + P(IT.review, l));
    }
    function scaleText() {
      clear(scaleLbl);
      var l = langOf(el);
      var marks = v === 'c' ? [0, 25, 50, 75, 100] : v === 'a' ? [0, 100] : [];
      marks.forEach(function (m) {
        var a = geo.a0 + geo.sweep * m / 100, p;
        if (v === 'c') { p = polar(geo.cx, geo.cy, geo.r - 30, a); p[1] += 4; }
        else { p = polar(geo.cx, geo.cy, geo.r, a); p[1] += 20; }
        var t = s('text', { x: p[0].toFixed(1), y: p[1].toFixed(1), 'text-anchor': 'middle' });
        t.textContent = digits(String(m), l);
        scaleLbl.appendChild(t);
      });
    }
    function text() {
      var l = langOf(el);
      lbl.textContent = P(o.label, l);
      unit.textContent = o.state === 'ok' && o.unit === '%' ? (l === 'ar' ? '٪' : '%') : '';
      note.textContent = P(o.note, l);
      note.hidden = !o.note;
      live_.textContent = o.state === 'ok' ? P(o.label, l) + ': ' + format(o.value, { lang: l, decimals: o.decimals || 0, percent: o.unit === '%' }) : P(o.label, l) + ': ' + P(IT.review, l);
      scaleText(); aria();
    }
    function chipIt() { if (chipComp) chipComp.destroy(); clear(chipBox); if (o.status) { chipComp = chip(o.status); chipBox.appendChild(chipComp.el); } }
    var comp = {
      el: el,
      get value() { return o.value; },
       
      set: function (next) {
        var had = o.state === 'ok';
        Object.assign(o, next || {});
        el.setAttribute('data-state', o.state);
        chipIt(); text();
        if (tw) tw.cancel();
        if (o.state !== 'ok') { shown = 0; draw(0); return; }
        if (!had) { shown = Number(o.value); draw(shown); return; }
        tw = tween(shown, Number(o.value), { easing: 'data' }, function (x) { shown = x; draw(x); });
      },
      relabel: function () { text(); draw(shown); },
      destroy: function () { if (tw) tw.cancel(); live.delete(comp); },
    };
    el.setAttribute('data-state', o.state);
    chipIt(); comp.relabel();
    return register(comp);
  }

   
  function counter(o) {
    o = Object.assign({ state: 'ok', variant: defaults.gauge }, o);
    var el = figure('counter', o.variant);
    var lbl = h('figcaption', { class: 'sqds-counter__label' });
    var num = h('span', { class: 'sqds-counter__num' }), unit = h('span', { class: 'sqds-counter__unit' });
    var big = h('p', { class: 'sqds-counter__value', 'aria-hidden': 'true' }, num, unit);
    var sr = h('p', { class: 'sqds-vh', 'aria-live': 'polite' });
    var delta = h('p', { class: 'sqds-counter__delta' });
    var formula = h('p', { class: 'sqds-counter__formula sqds-mono', dir: 'ltr' });
    var foot = h('div', { class: 'sqds-inst__foot' });
    el.append(lbl, big, sr, delta, formula, foot);
    var shown = o.state === 'ok' ? Number(o.value) : 0, tw = null, chipComp = null;
    function draw(x) {
      var l = langOf(el);
      num.textContent = o.state === 'ok' ? format(x, { lang: l, decimals: o.decimals || 0 }) : P(IT.review, l);
      unit.textContent = o.state === 'ok' && o.unit === '%' ? (l === 'ar' ? '٪' : '%') : (o.state === 'ok' && o.unit ? ' ' + P(o.unit, l) : '');
    }
    function text() {
      var l = langOf(el);
      lbl.textContent = P(o.label, l);
      sr.textContent = P(o.label, l) + ': ' + (o.state === 'ok' ? format(o.value, { lang: l, decimals: o.decimals || 0, percent: o.unit === '%' }) : P(IT.review, l));
      if (o.delta && o.state === 'ok' && isFinite(o.delta.value) && o.delta.value !== 0) {
        var up = o.delta.value > 0;
        clear(delta);
        delta.append(glyph(up ? 'M12 5l6 7H6z' : 'M12 19l6-7H6z', 'sqds-counter__arrow'),
          h('span', null, (up ? '+' : '−') + format(Math.abs(o.delta.value), { lang: l, decimals: o.decimals || 0 }) + ' ' + P(o.delta.unit || ['نقطة', 'pts'], l) + ' ' + P(o.delta.vs, l)));
        delta.hidden = false;
      } else delta.hidden = true;
      formula.textContent = o.formula && o.state === 'ok' ? (typeof o.formula === 'function' ? o.formula(l) : P(o.formula, l)) : '';
      formula.hidden = !formula.textContent;
       
      formula.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
      draw(shown);
    }
    function chipIt() { if (chipComp) chipComp.destroy(); clear(foot); if (o.status) { chipComp = chip(o.status); foot.appendChild(chipComp.el); } }
    var comp = {
      el: el,
      set: function (next) {
        var prev = o.state === 'ok' ? o.value : null;
        Object.assign(o, next || {});
        el.setAttribute('data-state', o.state);
        if (tw) tw.cancel();
        chipIt(); text();
        if (o.state !== 'ok') { shown = 0; draw(0); return; }
        tw = tween(prev == null ? o.value : shown, Number(o.value), { easing: 'data' }, function (x) { shown = x; draw(x); });
      },
      relabel: function () { text(); },
      destroy: function () { if (tw) tw.cancel(); live.delete(comp); },
    };
    el.setAttribute('data-state', o.state);
    chipIt(); text();
    return register(comp);
  }

   
  function orbital(o) {
    o = Object.assign({ variant: defaults.gauge }, o);
    var el = figure('orbital', o.variant);
    var svg = s('svg', { class: 'sqds-orbital__svg', viewBox: '0 0 200 200', 'aria-hidden': 'true', focusable: 'false' });
    var orbit = s('circle', { class: 'sqds-orbital__orbit', cx: 100, cy: 100, r: 74 });
    var arcP = s('path', { class: 'sqds-orbital__arc', pathLength: 100, d: arcD(100, 100, 74, -90, 269.99) });
    var nodes = s('g', { class: 'sqds-orbital__nodes' });
    var sat = s('g', { class: 'sqds-orbital__sat' }, s('circle', { r: 10, class: 'halo' }), s('circle', { r: 5, class: 'core' }));
    svg.append(s('ellipse', { class: 'sqds-orbital__tilt', cx: 100, cy: 100, rx: 92, ry: 26, transform: 'rotate(-24 100 100)' }), orbit, arcP, nodes, sat);
    var big = h('p', { class: 'sqds-orbital__big', 'aria-hidden': 'true' });
    var sub = h('p', { class: 'sqds-orbital__sub', 'aria-hidden': 'true' });
    var lbl = h('p', { class: 'sqds-orbital__label' });
    var meter = h('div', { class: 'sqds-orbital__meter' }, svg, h('div', { class: 'sqds-orbital__center' }, big, sub));
    var foot = h('div', { class: 'sqds-inst__foot' });
    el.append(lbl, meter, foot);
    var shown = 0, tw = null, chipComp = null, hadValue = false;
    function valid() { return isFinite(o.target) && o.target > 0 && isFinite(o.actual) && o.actual >= 0; }
    function buildNodes() {
      clear(nodes);
      if (!valid() || o.target > 40 || Math.round(o.target) !== o.target) return;
      for (var i = 0; i < o.target; i++) {
        var p = polar(100, 100, 74, -90 + 360 * (i + 0.5) / o.target);
        nodes.appendChild(s('circle', { cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: o.target > 24 ? 2.2 : 3.1 }));
      }
    }
    function draw(x) {
      var l = langOf(el), ok = valid();
      var frac = ok ? Math.max(0, Math.min(1, x / o.target)) : 0;
      arcP.style.strokeDasharray = (frac * 100).toFixed(3) + ' 100';
      arcP.style.opacity = ok && frac > 0.0005 ? 1 : 0;
      var lit = ok ? Math.floor(x + 1e-6) : 0;
      Array.prototype.forEach.call(nodes.children, function (c, i) { c.classList.toggle('is-lit', i < lit); });
      var p = polar(100, 100, 74, -90 + 360 * frac);
      sat.setAttribute('transform', 'translate(' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + ')');
      sat.style.opacity = ok ? 1 : 0;
      big.textContent = ok ? digits(String(Math.round(x)), l) + ' / ' + digits(String(o.target), l) : P(IT.review, l);
      sub.textContent = ok ? format(round(o.actual / o.target * 100, 2), { lang: l, percent: true }) : '';
    }
    function aria() {
      var l = langOf(el);
      if (valid()) {
        meter.setAttribute('role', 'meter'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', String(o.target)); meter.setAttribute('aria-valuenow', String(o.actual));
        meter.setAttribute('aria-valuetext', digits(o.actual, l) + ' ' + P(IT.of, l) + ' ' + digits(o.target, l) + ' (' + format(o.actual / o.target * 100, { lang: l, percent: true }) + ')');
      } else {
        meter.setAttribute('role', 'img');
        ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'].forEach(function (a) { meter.removeAttribute(a); });
      }
      meter.setAttribute('aria-label', P(o.label, l) + (valid() ? '' : ': ' + P(IT.review, l)));
    }
    function chipIt() { if (chipComp) chipComp.destroy(); clear(foot); if (o.status) { chipComp = chip(o.status); foot.appendChild(chipComp.el); } }
    var comp = {
      el: el,
      set: function (next) {
        var oldTarget = o.target;
        Object.assign(o, next || {});
        el.setAttribute('data-state', valid() ? 'ok' : 'review');
        if (o.target !== oldTarget) buildNodes();
        chipIt(); aria(); lbl.textContent = P(o.label, langOf(el));
        if (tw) tw.cancel();
        if (!valid()) { shown = 0; draw(0); hadValue = false; return; }
        if (!hadValue) { shown = Number(o.actual); draw(shown); hadValue = true; return; }
        tw = tween(shown, Number(o.actual), { easing: 'data' }, function (x) { shown = x; draw(x); });
      },
      relabel: function () { lbl.textContent = P(o.label, langOf(el)); aria(); draw(shown); },
      destroy: function () { if (tw) tw.cancel(); live.delete(comp); },
    };
    el.setAttribute('data-state', valid() ? 'ok' : 'review');
    buildNodes(); shown = valid() ? o.actual : 0; hadValue = valid(); chipIt(); comp.relabel();
    return register(comp);
  }

   
  function compare(o) {
    o = Object.assign({ max: 100, unit: '%', variant: defaults.gauge }, o);
    var el = figure('compare', o.variant);
    var cap = h('figcaption', { class: 'sqds-compare__label' });
    var plot = h('div', { class: 'sqds-compare__plot' });
    var ticks = h('span', { class: 'sqds-compare__ticks' });
    var axis = h('div', { class: 'sqds-compare__row sqds-compare__axis', 'aria-hidden': 'true' }, h('span'), ticks);
    var tip = h('div', { class: 'sqds-compare__tip', role: 'presentation', hidden: true });
    var tableBtn = h('button', { type: 'button', class: 'sqds-btn sqds-btn--tertiary sqds-btn--md sqds-compare__tablebtn', 'aria-expanded': 'false' });
    var table = h('table', { class: 'sqds-compare__table', hidden: true });
    var foot = h('div', { class: 'sqds-inst__foot' });
    el.append(cap, h('div', { class: 'sqds-compare__frame' }, plot, axis, tip), foot, tableBtn, table);
    var rowsEl = {}, chipComp = null;
    tableBtn.addEventListener('click', function () {
      var open = table.hidden;
      table.hidden = !open; tableBtn.setAttribute('aria-expanded', String(open)); text();
    });
    function rowText(r, l) {
      return P(r.label, l) + ': ' + (r.state === 'review' ? P(IT.review, l) : format(r.value, { lang: l, percent: o.unit === '%', decimals: o.decimals || 0 }));
    }
    function build() {
      clear(plot); rowsEl = {};
      o.rows.forEach(function (r) {
        var bar = h('span', { class: 'sqds-compare__bar' });
        var val = h('span', { class: 'sqds-compare__val' });
        var name = h('span', { class: 'sqds-compare__name' });
        var row = h('div', { class: 'sqds-compare__row', tabindex: '0', role: 'img', 'data-key': r.key }, name, h('span', { class: 'sqds-compare__lane' }, bar, val));
        function show() {
          var l = langOf(el);
          tip.textContent = rowText(r, l); tip.hidden = false;
          var fr = el.querySelector('.sqds-compare__frame').getBoundingClientRect(), rr = row.getBoundingClientRect();
          tip.style.insetBlockStart = (rr.top - fr.top - 6) + 'px';
        }
        row.addEventListener('pointerenter', show); row.addEventListener('focus', show);
        row.addEventListener('pointerleave', function () { tip.hidden = true; }); row.addEventListener('blur', function () { tip.hidden = true; });
        plot.appendChild(row);
        rowsEl[r.key] = { row: row, bar: bar, val: val, name: name, data: r };
      });
    }
    function paint() {
      var l = langOf(el);
      o.rows.forEach(function (r) {
        var x = rowsEl[r.key]; if (!x) return;
        x.data = r;
        x.row.classList.toggle('is-current', !!r.current);
        x.row.setAttribute('data-state', r.state === 'review' ? 'review' : 'ok');
        x.row.setAttribute('aria-label', rowText(r, l));
        x.name.textContent = P(r.label, l);
        var frac = r.state === 'review' ? 0 : Math.max(0, Math.min(1, r.value / o.max));
        x.bar.style.inlineSize = 'calc((100% - var(--sqds-compare-room)) * ' + frac.toFixed(4) + ')';
        x.val.textContent = r.state === 'review' ? P(IT.review, l) : format(r.value, { lang: l, percent: o.unit === '%', decimals: o.decimals || 0 });
      });
    }
    function text() {
      var l = langOf(el);
      cap.textContent = P(o.label, l);
      clear(ticks);
      [0, 50, 100].forEach(function (m) { ticks.appendChild(h('span', { style: { '--at': String(m / 100) } }, digits(String(round(o.max * m / 100)), l) + (m === 100 && o.unit === '%' ? (l === 'ar' ? '٪' : '%') : ''))); });
      tableBtn.textContent = P(table.hidden ? IT.table : IT.hideTable, l);
      clear(table);
      table.append(h('caption', { class: 'sqds-vh' }, P(o.label, l)), h('thead', null, h('tr', null, h('th', { scope: 'col' }, P(IT.scenario, l)), h('th', { scope: 'col' }, P(IT.value, l)))),
        h('tbody', null, o.rows.map(function (r) { return h('tr', { class: r.current ? 'is-current' : null }, h('th', { scope: 'row' }, P(r.label, l)), h('td', null, r.state === 'review' ? P(IT.review, l) : format(r.value, { lang: l, percent: o.unit === '%', decimals: o.decimals || 0 }))); })));
      paint();
    }
    function chipIt() { if (chipComp) chipComp.destroy(); clear(foot); if (o.status) { chipComp = chip(o.status); foot.appendChild(chipComp.el); } }
    var comp = {
      el: el,
      set: function (next) {
        var keys = o.rows.map(function (r) { return r.key; }).join();
        Object.assign(o, next || {});
        if (o.rows.map(function (r) { return r.key; }).join() !== keys) build();
        chipIt(); text();
      },
      relabel: text,
      destroy: function () { live.delete(comp); },
    };
    build(); chipIt();
    el.classList.add('is-static');
    text();
    W.requestAnimationFrame(function () { el.classList.remove('is-static'); });
    return register(comp);
  }

   
  function centerOf(node, box) {
    var r = node.getBoundingClientRect();
    return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, w: r.width, h: r.height, l: r.left - box.left, t: r.top - box.top };
  }
   
  function pulse(svg, paths, opts) {
    opts = opts || {};
    if (reduced() || !paths.length) return Promise.resolve();
    var g = s('g', { class: 'sqds-pulse' }, s('circle', { r: 7, class: 'halo' }), s('circle', { r: 3, class: 'core' }));
    svg.appendChild(g);
    var lens = paths.map(function (p) { return p.getTotalLength(); });
    var total = lens.reduce(function (a, b) { return a + b; }, 0);
    var dur = opts.duration || Math.min(ms('--sqds-dur-sequence', 1200), 380 + 260 * paths.length);
    var f = easeFn('inout');
    return new Promise(function (resolve) {
      var t0 = null;
      function frame(now) {
        if (t0 === null) t0 = now;
        var p = Math.min(1, (now - t0) / dur), d = f(p) * total, i = 0;
        while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
        var pt = paths[i].getPointAtLength(Math.min(d, lens[i]));
        g.setAttribute('transform', 'translate(' + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2) + ')');
        paths.forEach(function (pp, k) { pp.classList.toggle('is-flow', k <= i); });
        if (p < 1) W.requestAnimationFrame(frame);
        else { g.remove(); paths.forEach(function (pp) { pp.classList.remove('is-flow'); }); resolve(); }
      }
      W.requestAnimationFrame(frame);
    });
  }

   
  function flow(o) {
    o = Object.assign({ variant: defaults.gauge }, o);
    var el = figure('flow', o.variant);
    var cap = h('figcaption', { class: 'sqds-flow__label' });
    var grid = h('div', { class: 'sqds-flow__grid' });
    var svg = s('svg', { class: 'sqds-flow__edges', 'aria-hidden': 'true', focusable: 'false' });
    var foot = h('div', { class: 'sqds-inst__foot' });
    var list = h('ul', { class: 'sqds-vh' });
    el.append(cap, h('div', { class: 'sqds-flow__stage' }, svg, grid), foot, list);
    var N = {}, E = [], chipComp = null;
    var cols = Math.max.apply(null, o.nodes.map(function (n) { return n.col; })) + 1;
    grid.style.setProperty('--cols', cols);
    o.nodes.forEach(function (n) {
      var v = h('span', { class: 'sqds-flow__v' }), l = h('span', { class: 'sqds-flow__k' });
      var node = h('div', { class: 'sqds-flow__node', 'data-key': n.key, 'data-role': n.role || null, style: { 'grid-column': String(n.col + 1), 'grid-row': n.row != null ? (n.row + 1) + ' / span ' + (n.span || 1) : null } }, l, v);
      grid.appendChild(node);
      N[n.key] = { el: node, v: v, k: l, data: n };
    });
    o.edges.forEach(function (e) { var p = s('path', { class: 'sqds-flow__edge', 'data-from': e[0], 'data-to': e[1] }); svg.appendChild(p); E.push({ from: e[0], to: e[1], p: p }); });
    function layout() {
      var box = grid.getBoundingClientRect();
      if (!box.width) return;
      svg.setAttribute('viewBox', '0 0 ' + box.width.toFixed(1) + ' ' + box.height.toFixed(1));
      svg.style.width = box.width + 'px'; svg.style.height = box.height + 'px';
      var rtl = dirOf(el) === 'rtl';
      E.forEach(function (e) {
        var a = centerOf(N[e.from].el, box), b = centerOf(N[e.to].el, box);
        var x0 = rtl ? a.l : a.l + a.w, x1 = rtl ? b.l + b.w : b.l;
        var mx = (x0 + x1) / 2;
        e.p.setAttribute('d', 'M' + x0.toFixed(1) + ' ' + a.y.toFixed(1) + 'C' + mx.toFixed(1) + ' ' + a.y.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + b.y.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + b.y.toFixed(1));
      });
    }
    var ro = W.ResizeObserver ? new W.ResizeObserver(layout) : null;
    if (ro) ro.observe(grid);
    function downstream(keys) {
      var out = [], seen = {}, frontier = keys.slice();
      while (frontier.length) {
        var k = frontier.shift();
        E.forEach(function (e) { if (e.from === k && !seen[e.from + '>' + e.to]) { seen[e.from + '>' + e.to] = 1; out.push(e); frontier.push(e.to); } });
      }
      return out;
    }
    function paint() {
      var l = langOf(el);
      o.nodes.forEach(function (n) {
        var x = N[n.key]; x.data = n;
        x.k.textContent = P(n.label, l);
        x.v.textContent = n.state === 'review' ? P(IT.review, l) : (typeof n.value === 'function' ? n.value(l) : P(n.value, l));
        x.el.setAttribute('data-state', n.state || 'ok');
      });
      E.forEach(function (e) { e.p.classList.toggle('is-broken', N[e.from].data.state === 'review' || N[e.from].data.state === 'missing'); });
      clear(list);
      o.nodes.forEach(function (n) { list.appendChild(h('li', null, P(n.label, l) + ': ' + (n.state === 'review' ? P(IT.review, l) : (typeof n.value === 'function' ? n.value(l) : P(n.value, l))))); });
      cap.textContent = P(o.label, l);
    }
    function chipIt() { if (chipComp) chipComp.destroy(); clear(foot); if (o.status) { chipComp = chip(o.status); foot.appendChild(chipComp.el); } }
    var comp = {
      el: el, layout: layout,
       
      set: function (next) {
        var before = {};
        o.nodes.forEach(function (n) { before[n.key] = JSON.stringify([typeof n.value === 'function' ? n.value('en') : n.value, n.state]); });
        if (next && next.nodes) {
          next.nodes.forEach(function (nn) { var cur = o.nodes.filter(function (n) { return n.key === nn.key; })[0]; if (cur) Object.assign(cur, nn); });
        }
        if (next && next.status) o.status = next.status;
        var changed = o.nodes.filter(function (n) { return before[n.key] !== JSON.stringify([typeof n.value === 'function' ? n.value('en') : n.value, n.state]); }).map(function (n) { return n.key; });
        var inputs = changed.filter(function (k) { return !E.some(function (e) { return e.to === k; }); });
        paint(); chipIt(); layout();
        var path = downstream(inputs.length ? inputs : []);
        if (!path.length) return Promise.resolve();
         
        return Promise.all(inputs.map(function (k) { var chain = [], cur = k, guard = 0; while (guard++ < 8) { var e = E.filter(function (x) { return x.from === cur; })[0]; if (!e) break; chain.push(e.p); cur = e.to; } return pulse(svg, chain); }));
      },
      relabel: function () { paint(); layout(); },
      destroy: function () { if (ro) ro.disconnect(); live.delete(comp); },
    };
    paint(); chipIt();
    W.requestAnimationFrame(layout);
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(layout);
    return register(comp);
  }

   
  function evidence(o) {
    o = Object.assign({ variant: defaults.gauge }, o);
    var el = figure('evidence', o.variant);
    var cap = h('figcaption', { class: 'sqds-evi__label' });
    var rowsBox = h('div', { class: 'sqds-evi__rows' });
    el.append(cap, rowsBox);
    var R = {};
    function build() {
      clear(rowsBox); R = {};
      o.rows.forEach(function (r) {
        var steps = h('ol', { class: 'sqds-evi__ladder', 'aria-hidden': 'true' }, LADDER.map(function (k) { return h('li', { 'data-step': k }); }));
        var name = h('p', { class: 'sqds-evi__name' }), note = h('p', { class: 'sqds-evi__note' });
        var ends = h('p', { class: 'sqds-evi__ends', 'aria-hidden': 'true' }, h('span'), h('span'));
        var chipBox = h('div', { class: 'sqds-evi__chip' });
        var row = h('div', { class: 'sqds-evi__row' }, h('div', { class: 'sqds-evi__head' }, name, chipBox), steps, ends, note);
        rowsBox.appendChild(row);
        R[r.key] = { row: row, steps: steps, ends: ends, name: name, note: note, chipBox: chipBox, chip: null, data: r };
      });
    }
    function paint(animate) {
      var l = langOf(el);
      cap.textContent = P(o.label, l);
      o.rows.forEach(function (r) {
        var x = R[r.key]; if (!x) return;
        var prev = x.data.status; x.data = r;
        x.name.textContent = P(r.label, l);
        x.note.textContent = P(r.note, l); x.note.hidden = !r.note;
        x.ends.firstChild.textContent = P(STATUS.unverified.label, l); x.ends.lastChild.textContent = P(STATUS.verified.label, l);
        if (x.chip) x.chip.destroy();
        clear(x.chipBox); x.chip = chip(r.status); x.chipBox.appendChild(x.chip.el);
        var lvl = (STATUS[r.status] || STATUS.unverified).level;
        x.row.setAttribute('data-status', r.status);
        if (STATUS[r.status] && STATUS[r.status].signal) x.row.setAttribute('data-signal', 'verified'); else x.row.removeAttribute('data-signal');
        Array.prototype.forEach.call(x.steps.children, function (li, i) { li.classList.toggle('is-on', i < lvl); li.classList.toggle('is-at', i === lvl - 1); });
        if (animate && prev !== r.status && !reduced() && x.row.animate) {
          x.steps.animate([{ opacity: 0.35, transform: 'translateY(2px)' }, { opacity: 1, transform: 'none' }], { duration: ms('--sqds-dur-slow', 480), easing: ease('emphasized') });
        }
      });
    }
    var comp = {
      el: el,
      set: function (next) { var keys = o.rows.map(function (r) { return r.key; }).join(); Object.assign(o, next || {}); if (keys !== o.rows.map(function (r) { return r.key; }).join()) build(); paint(true); },
      relabel: function () { paint(false); },
      destroy: function () { live.delete(comp); },
    };
    build(); paint(false);
    return register(comp);
  }

   
  var WF = {
    label: ['سير العمل في سبع خطوات', 'The workflow in seven steps'], step: ['الخطوة', 'Step'],
    keys: ['مفاتيح الأسهم للتنقل، والمفتاحان Home و End للطرفين', 'Arrow keys move between steps; Home and End jump to the ends'],
  };
  var WF_ICONS = { problem: 'problem', inputs: 'inputs', ai: 'ai', process: 'automation', processing: 'automation', decision: 'decision', result: 'result', evidence: 'evidence' };

   
  function workflow(o) {
    o = Object.assign({ selected: 0, variant: defaults.workflow }, o);
    var id = o.id || nextId('sqds-wf');
    var el = h('div', { class: 'sqds-wf', id: id, 'data-sqds': 'workflow', 'data-sqds-variant': o.variant });
    var rail = h('div', { class: 'sqds-wf__rail', role: 'tablist' });
    var svg = s('svg', { class: 'sqds-wf__edges', 'aria-hidden': 'true', focusable: 'false' });
    var panel = h('div', { class: 'sqds-wf__panel', role: 'tabpanel', id: id + '-panel', tabindex: '0' });
    var hint = h('p', { class: 'sqds-wf__hint', id: id + '-hint' });
    el.append(h('div', { class: 'sqds-wf__stage' }, svg, rail), hint, panel);
    var tabs = [], edges = [], sel = Math.max(0, Math.min(o.steps.length - 1, o.selected)), vertical = false;
    o.steps.forEach(function (st, i) {
      var ic = icon(WF_ICONS[st.key] || st.icon || 'ai', { label: false, variant: o.variant });
      var badge = st.badge ? chip(st.badge) : null;
      var idx = h('span', { class: 'sqds-wf__idx', 'aria-hidden': 'true' });
      var lab = h('span', { class: 'sqds-wf__name' });
      var pre = h('span', { class: 'sqds-vh' });
      var tab = h('button', { type: 'button', role: 'tab', class: 'sqds-wf__node', id: id + '-tab-' + i, 'aria-controls': id + '-panel', 'aria-selected': 'false', tabindex: '-1', 'data-key': st.key, 'aria-describedby': id + '-hint' },
        h('span', { class: 'sqds-wf__orb' }, ic, idx), h('span', { class: 'sqds-wf__text' }, pre, lab, badge ? badge.el : null));
      tab.addEventListener('click', function () { select(i, { focus: false }); });
      tab.addEventListener('keydown', onKey);
      rail.appendChild(tab);
      tabs.push({ tab: tab, ic: ic, lab: lab, idx: idx, pre: pre, badge: badge, data: st });
      if (i > 0) { var p = s('path', { class: 'sqds-wf__edge' }); svg.appendChild(p); edges.push(p); }
    });
    function orient() {
      var w = rail.getBoundingClientRect().width;
      var v = W.getComputedStyle(rail).getPropertyValue('--sqds-wf-vertical').trim() === '1' || (w > 0 && w < 640 && !W.CSS.supports('container-type', 'inline-size'));
      vertical = v;
      el.toggleAttribute('data-vertical', v);
      rail.setAttribute('aria-orientation', v ? 'vertical' : 'horizontal');
    }
    function layout() {
      orient();
      var stage = svg.parentNode.getBoundingClientRect();
      if (!stage.width) return;
      svg.setAttribute('viewBox', '0 0 ' + stage.width.toFixed(1) + ' ' + stage.height.toFixed(1));
      svg.style.width = stage.width + 'px'; svg.style.height = stage.height + 'px';
      var pts = tabs.map(function (t) { return centerOf(t.tab.querySelector('.sqds-wf__orb'), stage); });
      edges.forEach(function (p, i) {
        var a = pts[i], b = pts[i + 1], d;
        var ra = Math.min(a.w, a.h) / 2 + 4, rb = Math.min(b.w, b.h) / 2 + 4;
        if (vertical) d = 'M' + a.x.toFixed(1) + ' ' + (a.y + ra).toFixed(1) + 'L' + b.x.toFixed(1) + ' ' + (b.y - rb).toFixed(1);
        else {
          var dir = b.x > a.x ? 1 : -1, x0 = a.x + dir * ra, x1 = b.x - dir * rb;
          if (o.variant === 'b') { var mx = (x0 + x1) / 2, bulge = (i % 2 ? 1 : -1) * Math.min(26, Math.abs(x1 - x0) * 0.28); d = 'M' + x0.toFixed(1) + ' ' + a.y.toFixed(1) + 'Q' + mx.toFixed(1) + ' ' + (a.y + bulge).toFixed(1) + ' ' + x1.toFixed(1) + ' ' + b.y.toFixed(1); }
          else if (o.variant === 'c') { var mx2 = (x0 + x1) / 2; d = 'M' + x0.toFixed(1) + ' ' + a.y.toFixed(1) + 'H' + mx2.toFixed(1) + 'V' + b.y.toFixed(1) + 'H' + x1.toFixed(1); }
          else d = 'M' + x0.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + x1.toFixed(1) + ' ' + b.y.toFixed(1);
        }
        p.setAttribute('d', d);
        p.classList.toggle('is-done', i < sel);
      });
    }
    function onKey(e) {
      var i = tabs.findIndex(function (t) { return t.tab === e.currentTarget; }), n = tabs.length, j = null;
      var rtl = dirOf(el) === 'rtl';
      var nextKey = vertical ? 'ArrowDown' : (rtl ? 'ArrowLeft' : 'ArrowRight'), prevKey = vertical ? 'ArrowUp' : (rtl ? 'ArrowRight' : 'ArrowLeft');
      if (e.key === nextKey || (!vertical && e.key === 'ArrowDown') || (vertical && e.key === (rtl ? 'ArrowLeft' : 'ArrowRight'))) j = (i + 1) % n;
      else if (e.key === prevKey || (!vertical && e.key === 'ArrowUp') || (vertical && e.key === (rtl ? 'ArrowRight' : 'ArrowLeft'))) j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j == null) return;
      e.preventDefault();
      select(j, { focus: true });
    }
    function renderPanel() {
      var l = langOf(el), st = o.steps[sel], t = tabs[sel];
      clear(panel);
      panel.setAttribute('aria-labelledby', t.tab.id);
      var head = h('div', { class: 'sqds-wf__phead' },
        h('span', { class: 'sqds-wf__pidx sqds-mono', 'aria-hidden': 'true' }, digits(String(sel + 1).padStart(2, '0'), l)),
        h('h' + Math.min(6, Math.max(2, o.headingLevel || 3)), { class: 'sqds-wf__ptitle' }, P(st.title || st.label, l)),
        st.badge ? chip(st.badge).el : null);
      panel.append(head, h('p', { class: 'sqds-wf__ptext' }, P(st.text, l)));
      if (st.meta) panel.appendChild(h('p', { class: 'sqds-wf__pmeta' }, P(st.meta, l)));
    }
    function paintTabs() {
      var l = langOf(el);
      tabs.forEach(function (t, i) {
        var on = i === sel;
        t.tab.setAttribute('aria-selected', String(on));
        t.tab.tabIndex = on ? 0 : -1;
        t.tab.classList.toggle('is-active', on);
        t.tab.classList.toggle('is-done', i < sel);
        t.lab.textContent = P(t.data.label, l);
        t.idx.textContent = digits(String(i + 1), l);
        t.pre.textContent = P(WF.step, l) + ' ' + digits(String(i + 1), l) + (l === 'ar' ? '، ' : ': ');
      });
      rail.setAttribute('aria-label', P(o.label || WF.label, l));
      hint.textContent = P(WF.keys, l);
    }
    function select(i, opt) {
      opt = opt || {};
      if (i === sel && !opt.force) { if (opt.focus) tabs[i].tab.focus(); return Promise.resolve(); }
      var from = sel;
      sel = i;
      paintTabs(); renderPanel(); layout();
      if (opt.focus) tabs[i].tab.focus();
      playIcon(tabs[i].ic);
      if (o.onSelect) o.onSelect(i, o.steps[i]);
      var lo = Math.min(from, i), hi = Math.max(from, i), chain = edges.slice(lo, hi);
      if (i < from) chain = chain.reverse();
      var reverse = i < from;
      if (!chain.length) return Promise.resolve();
      if (reverse) {
         
        var tmp = chain.map(function (p) { var c = s('path', { class: 'sqds-wf__edge is-ghost', d: reversePath(p) }); svg.appendChild(c); return c; });
        return pulse(svg, tmp).then(function () { tmp.forEach(function (c) { c.remove(); }); });
      }
      return pulse(svg, chain);
    }
    function reversePath(p) {
      var L = p.getTotalLength(), n = 24, pts = [];
      for (var k = 0; k <= n; k++) { var q = p.getPointAtLength(L * (1 - k / n)); pts.push(q.x.toFixed(1) + ' ' + q.y.toFixed(1)); }
      return 'M' + pts.join('L');
    }
    var ro = W.ResizeObserver ? new W.ResizeObserver(function () { layout(); }) : null;
    if (ro) ro.observe(rail);
    var comp = {
      el: el, select: function (i) { return select(i, { focus: false }); }, get selected() { return sel; }, layout: layout,
      relabel: function () { paintTabs(); renderPanel(); W.requestAnimationFrame(layout); },
      destroy: function () { if (ro) ro.disconnect(); live.delete(comp); },
    };
    paintTabs(); renderPanel();
    W.requestAnimationFrame(layout);
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(layout);
    return register(comp);
  }

   
  var NAV = { menu: ['القائمة', 'Menu'], close: ['إغلاق القائمة', 'Close menu'], label: ['أقسام الصفحة', 'Page sections'] };

   
  function nav(o) {
    o = Object.assign({ variant: defaults.nav, sticky: true }, o);
    var id = o.id || nextId('sqds-nav');
    var el = h('header', { class: 'sqds-nav' + (o.sticky ? ' is-sticky' : ''), id: id, 'data-sqds': 'nav', 'data-sqds-variant': o.variant });
    var brandLabel = h('span', { class: 'sqds-nav__brand-t' });
    var brand = h('a', { class: 'sqds-nav__brand', href: (o.brand && o.brand.href) || '#' }, h('span', { class: 'sqds-nav__mark', 'aria-hidden': 'true', translate: 'no' }, (o.brand && o.brand.mark) || 'FJ'), brandLabel);
    var ul = h('ul', { class: 'sqds-nav__list' });
    var indicator = h('span', { class: 'sqds-nav__indicator', 'aria-hidden': 'true' });
    var navEl = h('nav', { class: 'sqds-nav__links' }, ul, indicator);
    var menuLabel = h('span', { class: 'sqds-nav__menu-t' });
    var menuBtn = h('button', { type: 'button', class: 'sqds-nav__menu', 'aria-expanded': 'false', 'aria-controls': id + '-sheet' }, glyph('M4 7h16M4 12h16M4 17h16', 'sqds-nav__burger'), menuLabel);
    var sheetUl = h('ul', { class: 'sqds-nav__sheet-list' });
    var sheetNav = h('nav', { class: 'sqds-nav__sheet', id: id + '-sheet', hidden: true }, sheetUl);
    var actions = h('div', { class: 'sqds-nav__actions' }, o.actions || null);
    var stamp = o.release ? h('span', { class: 'sqds-nav__stamp', 'data-signal': 'release' }) : null;
    var bar = h('div', { class: 'sqds-nav__bar' }, brand, navEl, stamp, actions, menuBtn);
    el.append(h('div', { class: 'sqds-nav__glass', 'aria-hidden': 'true' }), bar, sheetNav);
    var L = [], current = null;
    var pages = o.mode === 'pages';
    o.links.forEach(function (lk) {
      var a = h('a', { class: 'sqds-nav__link', href: lk.href || '#' + lk.id, 'data-id': lk.id }, h('span', { class: 'sqds-nav__num sqds-mono', 'aria-hidden': 'true' }), h('span', { class: 'sqds-nav__t' }));
      var a2 = h('a', { class: 'sqds-nav__sheet-link', href: lk.href || '#' + lk.id, 'data-id': lk.id });
      a2.addEventListener('click', function () { openMenu(false); });
      ul.appendChild(h('li', null, a)); sheetUl.appendChild(h('li', null, a2));
      L.push({ a: a, a2: a2, data: lk });
      magneticLink(a);
    });
    function magneticLink(a) {
      a.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse' || !finePointer() || reduced()) return;
        var r = a.getBoundingClientRect();
        a.style.translate = Math.max(-2.5, Math.min(2.5, (e.clientX - r.left - r.width / 2) * 0.12)).toFixed(2) + 'px ' + Math.max(-1.5, Math.min(1.5, (e.clientY - r.top - r.height / 2) * 0.12)).toFixed(2) + 'px';
      });
      a.addEventListener('pointerleave', function () { a.style.translate = ''; });
    }
     
    function moveIndicator(animate) {
      if (!animate) { el.classList.add('is-instant'); W.requestAnimationFrame(function () { W.requestAnimationFrame(function () { el.classList.remove('is-instant'); }); }); }
      var t = L.filter(function (x) { return x.data.id === current; })[0];
      if (!t || !navEl.offsetParent) { indicator.style.opacity = '0'; return; }
      var nb = navEl.getBoundingClientRect(), r = t.a.getBoundingClientRect();
      indicator.style.opacity = '1';
      indicator.style.width = r.width.toFixed(1) + 'px';
      indicator.style.transform = 'translateX(' + (r.left - nb.left).toFixed(1) + 'px)';
    }
    function setActive(idv, quiet) {
      if (idv === current) return;
      current = idv;
      L.forEach(function (x) {
        var on = x.data.id === idv;
        if (on) { x.a.setAttribute('aria-current', pages ? 'page' : 'location'); x.a2.setAttribute('aria-current', pages ? 'page' : 'location'); }
        else { x.a.removeAttribute('aria-current'); x.a2.removeAttribute('aria-current'); }
      });
      moveIndicator(!quiet);
    }
     
    var sRoot = o.scrollRoot || null, ticking = false;
    function sections() { return L.map(function (x) { return { id: x.data.id, node: (sRoot || D).querySelector('#' + CSS.escape(x.data.id)) }; }).filter(function (x) { return x.node; }); }
    function scan() {
      ticking = false;
      var list = sections(); if (!list.length) return;
      var vb = sRoot ? sRoot.getBoundingClientRect() : { top: 0, height: W.innerHeight };
      var line = vb.top + el.getBoundingClientRect().height + vb.height * 0.28, pick = list[0].id;
      list.forEach(function (x) { if (x.node.getBoundingClientRect().top <= line) pick = x.id; });
      var scrolledTop = sRoot ? sRoot.scrollTop : W.scrollY;
      var scrollable = sRoot ? sRoot.scrollHeight > sRoot.clientHeight + 2 : D.documentElement.scrollHeight > W.innerHeight + 2;
      var atEnd = scrollable && (sRoot ? sRoot.scrollTop + sRoot.clientHeight >= sRoot.scrollHeight - 2 : W.innerHeight + W.scrollY >= D.documentElement.scrollHeight - 2);
      if (atEnd) pick = list[list.length - 1].id;
      el.classList.toggle('is-scrolled', scrolledTop > 12);
      setActive(pick);
    }
    function onScroll() { if (!ticking) { ticking = true; W.requestAnimationFrame(pages ? function () { ticking = false; el.classList.toggle('is-scrolled', (sRoot ? sRoot.scrollTop : W.scrollY) > 12); } : scan); } }
    (sRoot || W).addEventListener('scroll', onScroll, { passive: true });
     
    function pageFromLocation() {
      if (o.current) return o.current;
      var path = location.pathname.replace(/index\.html$/, ''), q = new URLSearchParams(location.search), hit = null;
      L.forEach(function (x) {    
        var u = new URL(x.a.href, location.href), ok = u.pathname.replace(/index\.html$/, '') === path;
        u.searchParams.forEach(function (v, k) { if (q.get(k) !== v) ok = false; });
        if (ok && !hit) hit = x.data.id;
      });
      return hit;
    }
    W.addEventListener('resize', function () { moveIndicator(); onScroll(); });
     
    function fit() {
       
      var was = el.hasAttribute('data-collapsed');
      if (was) el.removeAttribute('data-collapsed');
      if (!navEl.offsetParent) { moveIndicator(); return; }           
      var cs = W.getComputedStyle(bar), gap = parseFloat(cs.columnGap) || 0, kids = 2 + (actions.offsetWidth ? 1 : 0) + (stamp && stamp.offsetWidth ? 1 : 0);
      var natural = brand.offsetWidth + ul.scrollWidth + actions.offsetWidth + (stamp ? stamp.offsetWidth : 0) + gap * (kids - 1) + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 4;
      var avail = bar.clientWidth;
      if (was ? avail < natural + 24 : natural > avail) el.setAttribute('data-collapsed', '');
      moveIndicator();
    }
    var ro = W.ResizeObserver ? new W.ResizeObserver(function () { fit(); onScroll(); }) : null;
    if (ro) { ro.observe(bar); ro.observe(ul); if (sRoot) ro.observe(sRoot); }
    if (D.fonts && D.fonts.addEventListener) D.fonts.addEventListener('loadingdone', function () { fit(); });
     
    function openMenu(want) {
      var open = want == null ? sheetNav.hidden : !!want;
      sheetNav.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      el.classList.toggle('is-open', open);
      relabelMenu();
      if (open) { var first = sheetNav.querySelector('a'); if (first) first.focus(); }
    }
    menuBtn.addEventListener('click', function () { openMenu(); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !sheetNav.hidden) { e.stopPropagation(); openMenu(false); menuBtn.focus(); }
    });
    D.addEventListener('pointerdown', function (e) { if (!sheetNav.hidden && !el.contains(e.target)) openMenu(false); });
    function relabelMenu() { menuLabel.textContent = P(sheetNav.hidden ? NAV.menu : NAV.close, langOf(el)); }
    var comp = {
      el: el, setActive: function (x) { setActive(x); }, open: openMenu, scan: scan,
      get current() { return current; },
      relabel: function () {
        var l = langOf(el);
        brandLabel.textContent = P(o.brand && o.brand.label, l);
        navEl.setAttribute('aria-label', P(o.label || NAV.label, l));
        sheetNav.setAttribute('aria-label', P(o.label || NAV.label, l));
        L.forEach(function (x, i) {
          x.a.querySelector('.sqds-nav__t').textContent = P(x.data.label, l);
          x.a.querySelector('.sqds-nav__num').textContent = digits(String(i + 1).padStart(2, '0'), l);
          x.a2.textContent = P(x.data.label, l);
        });
        if (stamp) stamp.textContent = P(o.release.label, l);
        relabelMenu();
        W.requestAnimationFrame(moveIndicator);
      },
      destroy: function () { (sRoot || W).removeEventListener('scroll', onScroll); if (ro) ro.disconnect(); live.delete(comp); },
    };
    comp.relabel();
    W.requestAnimationFrame(function () { if (pages) setActive(pageFromLocation(), true); else { scan(); if (current) setActive(current, true); } });
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(fit);
    return register(comp);
  }

   
  var defaults = { card: 'a', icon: 'a', button: 'a', gauge: 'a', workflow: 'a', nav: 'a' };
  return {
    version: VERSION,
    defaults: defaults,
    status: STATUS,
    ladder: LADDER,
    icons: ICONSET,
    icon: icon, playIcon: playIcon, hoverIcon: hoverIcon, chip: chip, button: button, magnetic: magnetic,
    h: h, s: s, register: register, unregister: function (c) { live.delete(c); },
    card: card,
    gauge: gauge, counter: counter, orbital: orbital, compare: compare, flow: flow, evidence: evidence,
    workflow: workflow, nav: nav,
    relabel: relabel,
    format: format, digits: digits, round: round, P: P, langOf: langOf, tween: tween, pulse: pulse,
    reducedMotion: reduced, finePointer: finePointer,
  };
}));

;
 
(function (W) {
  'use strict';
  var S = W.SQDS;
  if (!S) throw new Error('sqds-stage.js needs sqds.js first');
  var D = W.document, P = S.P, h = S.h, svgEl = S.s;
  var reduced = S.reducedMotion;

   
  var SCN = { tag: ['سيناريو افتراضي', 'Hypothetical scenario'], steps: ['خطوات السيناريو', 'Scenario steps'], step: ['الخطوة', 'Step'], of: ['من', 'of'], replay: ['أعد التشغيل', 'Replay'] };
  function scenario(o) {
    o = o || {};
    if (!Array.isArray(o.steps) || o.steps.length < 2) throw new Error('SQDS.scenario: pass the steps (at least two); the component never invents them');
    var id = o.id || 'sqds-scn-' + Math.random().toString(36).slice(2, 8);
    var el = h('figure', { class: 'sqds-scn', id: id, 'data-sqds': 'scenario', 'data-sqds-variant': o.variant || S.defaults.card, 'aria-labelledby': id + '-cap' });
    var tagT = h('span', { class: 'sqds-scn__tag-t' });
    var tag = h('span', { class: 'sqds-scn__tag' }, svgEl('svg', { viewBox: '0 0 12 12', 'aria-hidden': 'true', focusable: 'false' }, svgEl('path', { d: 'M6 1.8L10.2 6 6 10.2 1.8 6z' })), tagT);
    var cap = h('figcaption', { class: 'sqds-scn__cap', id: id + '-cap' }, tag, o.label ? h('span', { class: 'sqds-scn__title' }) : null);
    var ol = h('ol', { class: 'sqds-scn__steps' });
    var items = o.steps.map(function (st, i) {
      var ic = S.icon(st.icon, { label: false, variant: o.variant, size: 30 });
      var pre = h('span', { class: 'sqds-vh' }), lab = h('span', { class: 'sqds-scn__label' });
      var li = h('li', { class: 'sqds-scn__step' }, h('span', { class: 'sqds-scn__orb', 'aria-hidden': 'true' }, ic), h('span', { class: 'sqds-scn__text' }, pre, lab),
        i < o.steps.length - 1 ? h('span', { class: 'sqds-scn__link', 'aria-hidden': 'true' }, h('i')) : null);
      ol.appendChild(li);
      return { li: li, ic: ic, pre: pre, lab: lab, data: st };
    });
    var replay = o.replay === false ? null : h('button', { type: 'button', class: 'sqds-btn sqds-btn--tertiary sqds-btn--md sqds-scn__replay' });
    el.append(cap, ol);
    if (replay) el.appendChild(replay);
    var played = false, running = null, io = null;
    function relabel() {
      var l = S.langOf(el);
      tagT.textContent = P(o.tag || SCN.tag, l);
      if (o.label) cap.querySelector('.sqds-scn__title').textContent = P(o.label, l);
      ol.setAttribute('aria-label', P(SCN.steps, l));
      items.forEach(function (it, i) {
        it.pre.textContent = P(SCN.step, l) + ' ' + S.digits(i + 1, l) + ' ' + P(SCN.of, l) + ' ' + S.digits(items.length, l) + (l === 'ar' ? '، ' : ': ');
        it.lab.textContent = P(it.data.label, l);
      });
      if (replay) replay.textContent = P(SCN.replay, l);
    }
    function settle() { items.forEach(function (it) { it.li.classList.add('is-lit'); }); el.classList.add('is-done'); }
     
    function play() {
      if (running) return running;
      played = true;
      if (reduced()) { settle(); return Promise.resolve(); }
      el.classList.remove('is-done');
      items.forEach(function (it) { it.li.classList.remove('is-lit'); });
      var dur = 380, i = 0;
      running = new Promise(function (resolve) {
        (function next() {
          var it = items[i];
          it.li.classList.add('is-lit');
          S.hoverIcon(it.ic, 'pulse');
          var bar = it.li.querySelector('.sqds-scn__link i');
          if (!bar || !bar.animate) { running = null; el.classList.add('is-done'); resolve(); return; }
          bar.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.85 }, { transform: 'scaleX(1)', opacity: 0.35 }], { duration: dur, easing: 'cubic-bezier(.65, 0, .35, 1)' })
            .finished.then(function () { i += 1; next(); }, function () { running = null; resolve(); });
        })();
      });
      return running.then(function () { running = null; });
    }
    if (replay) replay.addEventListener('click', function () { play(); });
    if ((o.trigger || 'view') === 'view' && W.IntersectionObserver) {
      io = new W.IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio >= 0.6 && !played) { played = true; io.disconnect(); W.setTimeout(play, o.delay || 0); } }); }, { threshold: [0, 0.6] });
      io.observe(el);
    }
    if (reduced()) settle();
    var comp = { el: el, play: play, relabel: relabel, destroy: function () { if (io) io.disconnect(); S.unregister(comp); } };
    relabel();
    return S.register(comp);
  }

   
  var BG = { credit: ['فن مفاهيمي مولَّد بالذكاء الاصطناعي', 'AI-generated concept art'] };
  var TIERS = { high: { n: 56, fps: 30, dpr: 1.5 }, mid: { n: 32, fps: 24, dpr: 1.25 }, low: { n: 0, fps: 0, dpr: 1 }, off: { n: 0, fps: 0, dpr: 1 } };
  var ORDER = ['high', 'mid', 'low', 'off'];
  function guessTier() {
    var n = W.navigator || {};
    if (n.connection && n.connection.saveData) return 'off';
    if ((n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4)) return 'low';
    return 'high';
  }
  function background(o) {
    o = o || {};
    var mount = o.mount || D.body, fixed = o.fixed !== false;
    var el = h('div', { class: 'sqds-bg' + (fixed ? ' is-fixed' : ''), 'data-sqds': 'background', 'aria-hidden': 'true' });
    var img = h('div', { class: 'sqds-bg__img' }), haze = h('div', { class: 'sqds-bg__haze' }), light = h('div', { class: 'sqds-bg__light' }), scrim = h('div', { class: 'sqds-bg__scrim' });
    var canvas = h('canvas', { class: 'sqds-bg__canvas', width: '2', height: '2' });
    if (o.image) img.style.backgroundImage = 'url("' + String(o.image).replace(/"/g, '%22') + '")';
    el.append(img, haze, canvas, light, scrim);
    var credit = o.image && o.credit !== false ? h('aside', { class: 'sqds-bg__credit' + (fixed ? ' is-fixed' : '') }) : null;
    if (fixed) { mount.insertBefore(el, mount.firstChild); if (credit) mount.appendChild(credit); }
    else { mount.classList.add('sqds-bg-host'); mount.insertBefore(el, mount.firstChild); if (credit) mount.appendChild(credit); }
    var tier = o.quality && o.quality !== 'auto' ? o.quality : guessTier();
    var ctx = canvas.getContext && canvas.getContext('2d'), raf = 0, last = 0, parts = [], paths = [], visible = true, onScreen = true, slow = 0, frames = 0;
    function setTier(t) { tier = t; el.setAttribute('data-quality', t); seed(); restart(); }
    function size() {
      var dpr = Math.min(W.devicePixelRatio || 1, TIERS[tier].dpr), r = el.getBoundingClientRect();
      canvas.width = Math.max(2, Math.round(r.width * dpr)); canvas.height = Math.max(2, Math.round(r.height * dpr));
      canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paths = [0, 1, 2, 3].map(function (k) {    
        var y = r.height * (0.18 + 0.2 * k), w = r.width;
        return [[-20, y], [w * 0.3, y - 60 + 40 * k], [w * 0.65, y + 70 - 30 * k], [w + 20, y - 20 + 10 * k]];
      });
    }
    function bez(p, t) { var u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; }
    function seed() {    
      var n = TIERS[tier].n, s = 7;
      function rnd() { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }
      parts = [];
      for (var i = 0; i < n; i++) parts.push({ path: i % 4, t: rnd(), v: 0.006 + rnd() * 0.012, r: 0.6 + rnd() * 1.3, a: 0.25 + rnd() * 0.5 });
    }
    function draw(now) {
      raf = 0;
      if (!running()) return;
      var fps = TIERS[tier].fps, dt = now - last;
      if (dt < 1000 / fps - 2) { raf = W.requestAnimationFrame(draw); return; }
      if (last && dt > 60) slow++; frames++;
      last = now;
      var t0 = W.performance.now(), r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.lineWidth = 1;
      paths.forEach(function (p) {    
        ctx.strokeStyle = 'rgba(127, 162, 255, .07)';
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]); ctx.stroke();
      });
      parts.forEach(function (q) {
        q.t = (q.t + q.v * (dt / 1000) * 3) % 1;
        var pt = bez(paths[q.path], q.t);
        ctx.fillStyle = 'rgba(220, 248, 252, ' + q.a.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(pt[0], pt[1], q.r, 0, 6.2832); ctx.fill();
      });
       
      if (W.performance.now() - t0 > 6) slow++;
      if (frames >= 90) { if (slow > 18 && o.quality === 'auto' || slow > 18 && !o.quality) { var i = ORDER.indexOf(tier); if (i < ORDER.length - 1) { setTier(ORDER[i + 1]); return; } } frames = 0; slow = 0; }
      raf = W.requestAnimationFrame(draw);
    }
    function running() { return visible && onScreen && !reduced() && TIERS[tier].n > 0 && !!ctx; }
    function restart() {
      el.classList.toggle('is-paused', !(visible && onScreen) || reduced());
      if (raf) { W.cancelAnimationFrame(raf); raf = 0; }
      if (running()) { last = 0; raf = W.requestAnimationFrame(draw); }
      else if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    function onVis() { visible = !D.hidden; restart(); }
    D.addEventListener('visibilitychange', onVis);
    var io = W.IntersectionObserver ? new W.IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; restart(); }) : null;
    if (io) io.observe(el);
    var ro = W.ResizeObserver ? new W.ResizeObserver(function () { size(); }) : null;
    if (ro) ro.observe(el);
     
    var sraf = 0;
    function parallax() {
      sraf = 0;
      if (reduced() || tier === 'off' || tier === 'low') { img.style.translate = haze.style.translate = canvas.style.translate = ''; return; }
      var y = fixed ? W.scrollY : -el.getBoundingClientRect().top;
      img.style.translate = '0 ' + (-y * 0.03).toFixed(1) + 'px';
      haze.style.translate = '0 ' + (-y * 0.07).toFixed(1) + 'px';
      canvas.style.translate = '0 ' + (-y * 0.12 % 400).toFixed(1) + 'px';
    }
    function onScroll() { if (!sraf) sraf = W.requestAnimationFrame(parallax); }
    W.addEventListener('scroll', onScroll, { passive: true });
     
    var sio = null;
    if (o.sections && o.sections.length && W.IntersectionObserver) {
      sio = new W.IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { var s = o.sections.filter(function (x) { return x.id === e.target.id; })[0]; if (s) el.setAttribute('data-light', s.light || 'cyan'); } });
      }, { rootMargin: '-40% 0px -55% 0px' });
      o.sections.forEach(function (s) { var n = D.getElementById(s.id); if (n) sio.observe(n); });
    }
    var comp = {
      el: el, credit: credit,
      get quality() { return tier; }, setQuality: setTier,
      pause: function () { visible = false; restart(); }, resume: function () { visible = !D.hidden; restart(); },
      relabel: function () { if (credit) { var l = S.langOf(credit); credit.textContent = P(o.credit || BG.credit, l); credit.setAttribute('aria-label', P(['مصدر الصورة', 'Image source'], l)); } },
      destroy: function () { D.removeEventListener('visibilitychange', onVis); W.removeEventListener('scroll', onScroll); if (io) io.disconnect(); if (ro) ro.disconnect(); if (sio) sio.disconnect(); if (raf) W.cancelAnimationFrame(raf); el.remove(); if (credit) credit.remove(); S.unregister(comp); },
    };
    el.setAttribute('data-quality', tier);
    el.setAttribute('data-light', (o.sections && o.sections[0] && o.sections[0].light) || 'cyan');
    seed(); size(); comp.relabel(); restart(); parallax();
    return S.register(comp);
  }

   
  function pageTransition(o) {
    o = o || {};
    var html = D.documentElement;
    if (reduced()) return { mode: 'none', destroy: function () {} };
    var crossDoc = o.force !== 'fade' && 'onpagereveal' in W && W.CSS && CSS.supports('view-transition-name: none');
    if (crossDoc) {
      if (!D.getElementById('sqds-vt')) D.head.appendChild(h('style', { id: 'sqds-vt' }, '@view-transition { navigation: auto; }'));
      return { mode: 'view-transition', destroy: function () { var st = D.getElementById('sqds-vt'); if (st) st.remove(); } };
    }
    html.classList.add('sqds-page-in');
    W.setTimeout(function () { html.classList.remove('sqds-page-in'); }, 400);
    function onClick(e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      html.classList.add('sqds-page-out');
      W.setTimeout(function () { location.href = url.href; }, o.duration || 160);
    }
    function onShow() { html.classList.remove('sqds-page-out'); }
    D.addEventListener('click', onClick);
    W.addEventListener('pageshow', onShow);
    return { mode: 'fade', destroy: function () { D.removeEventListener('click', onClick); W.removeEventListener('pageshow', onShow); } };
  }

  S.scenario = scenario;
  S.background = background;
  S.pageTransition = pageTransition;
})(window);
