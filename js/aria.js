/* ============================================================
   أريا — المساعدة الذكية لنيكسيوس
   Aria — Neexios AI assistant (chat + voice, no backend)

   القواعد الصارمة للصوت:
   - لا صوت ولا استماع تلقائي أبداً عند تحميل الصفحة
   - أيقونة المحادثة أعلى يمين الشات بوت هي مفتاح الصوت الوحيد:
     نقرة = تفعيل الحديث (استماع + رد صوتي)، نقرة أخرى = صمت تام
   - إغلاق النافذة أو مغادرة الصفحة يوقف كل صوت واستماع

   Speech out: Web Speech API (speechSynthesis) — prefers an
   "Aria" voice when the browser has one.
   Speech in: SpeechRecognition (Chrome/Edge/Safari); if the
   browser lacks it, Aria says so and text chat keeps working.
   ============================================================ */

(function () {
  "use strict";

  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  if (synth) synth.cancel(); // never resume anything automatically
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const isAr = () => (document.documentElement.lang || "ar").startsWith("ar");

  /* ============ DOM ============ */
  const launcher = document.createElement("button");
  launcher.id = "ariaToggle";
  launcher.className = "aria-btn";
  launcher.type = "button";
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-label", "فتح مساعدة أريا");
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>' +
    '<path d="M9 11h.01M13 11h.01M17 11h.01" stroke-width="2.5"/></svg>' +
    '<span class="aria-name">أريا</span>';

  const panel = document.createElement("section");
  panel.className = "aria-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "محادثة أريا");
  panel.hidden = true;
  panel.innerHTML =
    /* header — voice toggle first in DOM = top RIGHT in RTL */
    '<header class="aria-head">' +
    '  <button class="aria-ic aria-voice" id="ariaVoice" type="button" aria-pressed="false" title="الحديث مع أريا" aria-label="تفعيل الحديث الصوتي مع أريا / إيقافه">' +
    '    <svg class="ic-wave" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '      <path d="M3 12h1M7 8v8M11 5v14M15 8v8M19 10v4M22 12h-1"/></svg>' +
    '    <span class="voice-rings" aria-hidden="true"></span>' +
    "  </button>" +
    '  <div class="aria-id">' +
    '    <span class="aria-avatar" aria-hidden="true">' +
    '      <svg viewBox="0 0 40 40"><defs><linearGradient id="ag" x1="0" y1="0" x2="1" y2="1">' +
    '        <stop offset="0" stop-color="#35d0a5"/><stop offset="1" stop-color="#2a78d6"/></linearGradient></defs>' +
    '        <circle cx="20" cy="20" r="19" fill="url(#ag)"/>' +
    '        <path d="M20 9l2.2 6.2L28 17l-5.8 1.8L20 25l-2.2-6.2L12 17l5.8-1.8z" fill="#fff"/>' +
    '        <circle cx="27.5" cy="11" r="1.6" fill="#fff" opacity="0.9"/></svg>' +
    "    </span>" +
    "    <div>" +
    '      <strong>أريا <small>ARIA</small></strong>' +
    '      <span class="aria-status" id="ariaStatus"><i></i>متصلة</span>' +
    "    </div>" +
    "  </div>" +
    '  <button class="aria-ic aria-close" id="ariaClose" type="button" aria-label="إغلاق المحادثة">' +
    '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
    "  </button>" +
    "</header>" +
    '<div class="aria-msgs" id="ariaMsgs" aria-live="polite"></div>' +
    '<div class="aria-chips" id="ariaChips"></div>' +
    '<form class="aria-input" id="ariaForm">' +
    '  <input type="text" id="ariaField" placeholder="اكتبي سؤالك لأريا..." autocomplete="off" aria-label="رسالتك إلى أريا">' +
    '  <button type="submit" aria-label="إرسال">' +
    '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/></svg>' +
    "  </button>" +
    "</form>";

  document.body.append(launcher, panel);

  const msgsEl = panel.querySelector("#ariaMsgs");
  const chipsEl = panel.querySelector("#ariaChips");
  const statusEl = panel.querySelector("#ariaStatus");
  const voiceBtn = panel.querySelector("#ariaVoice");
  const field = panel.querySelector("#ariaField");

  /* ============ state ============ */
  let open = false;
  let voiceMode = false; // conversation mode: listen -> reply aloud -> listen
  let speaking = false;
  let listening = false;
  let rec = null;
  let greeted = false;

  /* ============ voice out ============ */
  function voices() { return synth ? synth.getVoices() : []; }
  if (synth && typeof synth.onvoiceschanged !== "undefined") {
    synth.addEventListener("voiceschanged", voices);
  }
  voices();

  function pickVoice() {
    const list = voices();
    const pref = isAr() ? "ar" : "en";
    return (
      list.find((v) => /aria/i.test(v.name) && v.lang.toLowerCase().startsWith(pref)) ||
      list.find((v) => v.lang.toLowerCase().startsWith(pref === "ar" ? "ar-sa" : "en-us")) ||
      list.find((v) => v.lang.toLowerCase().startsWith(pref)) ||
      list.find((v) => /aria/i.test(v.name)) ||
      null
    );
  }

  function speak(text, onDone) {
    if (!synth) { onDone && onDone(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = isAr() ? "ar-SA" : "en-US";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1;
    const done = () => { speaking = false; ui(); onDone && onDone(); };
    u.onend = done;
    u.onerror = done;
    speaking = true;
    ui();
    synth.speak(u);
  }

  function silence() {
    if (synth) synth.cancel();
    speaking = false;
    ui();
  }

  /* ============ voice in ============ */
  function startListening() {
    if (!SR || listening || !voiceMode) return;
    rec = new SR();
    rec.lang = isAr() ? "ar-SA" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript.trim();
      if (t) { addMsg("user", t); respond(t); }
    };
    rec.onend = () => {
      listening = false;
      ui();
      // keep the conversation alive while voice mode is on and Aria isn't talking
      if (voiceMode && !speaking) setTimeout(() => { if (voiceMode && !speaking) startListening(); }, 350);
    };
    rec.onerror = () => { listening = false; ui(); };
    try { rec.start(); listening = true; } catch (e) { listening = false; }
    ui();
  }

  function stopListening() {
    if (rec) { try { rec.onend = null; rec.stop(); } catch (e) { /* already stopped */ } }
    listening = false;
    ui();
  }

  /* ============ the single voice switch (top-right icon) ============ */
  voiceBtn.addEventListener("click", () => {
    if (voiceMode || speaking || listening) {
      // same button click = total silence
      voiceMode = false;
      stopListening();
      silence();
    } else {
      voiceMode = true;
      if (SR) {
        addMsg("aria", isAr() ? "تم تفعيل المحادثة الصوتية 🎙 تفضل، أنا أستمع إليك." : "Voice chat is on 🎙 Go ahead, I'm listening.");
        startListening();
      } else {
        addMsg("aria", isAr()
          ? "متصفحك لا يدعم التعرف على الصوت، لكن اكتب سؤالك وسأرد عليك صوتاً ونصاً."
          : "Your browser doesn't support speech recognition, but type your question and I'll reply with voice and text.");
      }
    }
    ui();
  });

  /* ============ UI state ============ */
  function ui() {
    voiceBtn.classList.toggle("live", voiceMode);
    voiceBtn.classList.toggle("listening", listening);
    voiceBtn.classList.toggle("talking", speaking);
    voiceBtn.setAttribute("aria-pressed", String(voiceMode));
    const dot = statusEl.querySelector("i");
    if (speaking) { statusEl.lastChild.textContent = "أتحدث الآن…"; dot.className = "talk"; }
    else if (listening) { statusEl.lastChild.textContent = "أستمع إليك…"; dot.className = "listen"; }
    else { statusEl.lastChild.textContent = "متصلة"; dot.className = ""; }
  }

  /* ============ messages ============ */
  function addMsg(who, text) {
    const b = document.createElement("div");
    b.className = "msg " + who;
    b.textContent = text; // untrusted input stays text
    msgsEl.appendChild(b);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return b;
  }

  function typingOn() {
    const t = document.createElement("div");
    t.className = "msg aria typing";
    t.innerHTML = "<i></i><i></i><i></i>";
    msgsEl.appendChild(t);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return t;
  }

  /* ============ Aria's local brain ============ */
  const onDashboard = /dashboard/.test(location.pathname);

  function brain(raw) {
    const t = raw.toLowerCase();
    const has = (...words) => words.some((w) => t.includes(w));

    if (has("سلام", "مرحبا", "هلا", "اهلا", "أهلا", "صباح", "مساء", "hello", "hi ", "hey"))
      return "أهلاً وسهلاً! أنا أريا، مساعدة نيكسيوس الذكية. كيف أقدر أخدمك اليوم؟";
    if (has("من انت", "من أنت", "مين انت", "عرفي", "who are you"))
      return "أنا أريا، المساعدة الذكية لمنصة نيكسيوس لحجز رحلات الباصات. أجيبك عن الحجز والأسعار والوجهات، وأقرأ لك محتوى الصفحة صوتياً متى طلبت.";
    if (has("احجز", "حجز", "تذكرة", "تذاكر", "book"))
      return "الحجز سهل جداً: من نموذج «ابحث عن رحلتك» اختر مدينة الانطلاق والوصول وتاريخ السفر وعدد المسافرين، ثم اضغط «ابحث عن الرحلات». بعدها تختار الرحلة والمقعد وتدفع إلكترونياً، وتصلك التذكرة فوراً على جوالك.";
    if (has("سعر", "أسعار", "اسعار", "كم", "تكلفة", "price", "cost"))
      return "الأسعار تبدأ من ٢٥ ريالاً لمسار جدة–مكة، و٧٠ ريالاً للرياض–الدمام، و٩٥ ريالاً للرياض–جدة. الأسعار تختلف حسب التاريخ وشركة النقل — ابحث عن رحلتك لعرض الأسعار الفعلية.";
    if (has("وجهات", "مسارات", "مدن", "وين تروحون", "routes", "destinations"))
      return "نغطي أكثر من ١٢٠ وجهة، وأشهر مساراتنا: الرياض–جدة، جدة–مكة المكرمة، الرياض–الدمام، المدينة–مكة، وجدة–المدينة. تجد القائمة كاملة في قسم «وجهات شائعة».";
    if (has("تتبع", "وين الباص", "موقع", "track"))
      return "بعد تأكيد حجزك يظهر زر «تتبع الرحلة» في صفحة التذكرة، يعرض لك موقع الباص على الخريطة لحظة بلحظة، وتقدر تشارك الرابط مع أهلك.";
    if (has("الغاء", "إلغاء", "الغي", "استرداد", "استرجاع", "cancel", "refund"))
      return "تقدر تلغي حجزك مجاناً قبل موعد الرحلة بـ٢٤ ساعة وتسترد المبلغ كاملاً. التعديل أيضاً متاح حسب سياسة شركة النقل، كل ذلك من صفحة حجوزاتك.";
    if (has("دفع", "فيزا", "مدى", "ابل", "بطاقة", "pay"))
      return "ندعم بطاقات مدى وفيزا وماستركارد وApple Pay والمحافظ الرقمية، وجميع المعاملات مشفرة بالكامل.";
    if (has("تواصل", "رقم", "هاتف", "ايميل", "إيميل", "بريد", "دعم", "contact", "support"))
      return "فريق الدعم متاح على مدار الساعة: البريد support@neexios.com والهاتف 0000 92 966+. وتقدر تستخدم نموذج «تواصل معنا» في أسفل الصفحة.";
    if (has("اقرأ", "اقرئي", "اقري", "الصفحة", "read"))
      return typeof window.ARIA_TEXT === "function" ? window.ARIA_TEXT() : document.title;
    if (has("ملخص", "الأداء", "الاداء", "مؤشرات", "احصائيات", "إحصائيات", "summary", "kpi"))
      return onDashboard && typeof window.ARIA_TEXT === "function"
        ? window.ARIA_TEXT()
        : "تجد ملخص الأداء الكامل في لوحة التحكم — رابطها في أسفل الصفحة، وهناك اسأليني «ملخص الأداء» وسأقرأه لك بالأرقام الحية.";
    if (has("شكرا", "شكراً", "يعطيك", "ممتاز", "thanks", "thank"))
      return "العفو! سعيدة بخدمتك دائماً. هل تحتاج شيئاً آخر؟ 🌟";
    if (has("مع السلامة", "باي", "وداعا", "bye"))
      return "في أمان الله! متى ما احتجتني اضغط على زر أريا وسأكون هنا. رحلة سعيدة 🚌";
    return "سؤال جميل! أقدر أساعدك في: الحجز، الأسعار، الوجهات، تتبع الرحلة، الإلغاء والاسترداد، أو قراءة الصفحة صوتياً. عن أي موضوع تحب نتكلم؟";
  }

  /* ============ conversation flow ============ */
  function respond(userText) {
    stopListening(); // don't hear ourselves talk
    const t = typingOn();
    setTimeout(() => {
      t.remove();
      const answer = brain(userText);
      addMsg("aria", answer);
      if (voiceMode) {
        speak(answer, () => { if (voiceMode) startListening(); });
      }
    }, 550);
  }

  panel.querySelector("#ariaForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = field.value.trim();
    if (!t) return;
    field.value = "";
    addMsg("user", t);
    respond(t);
  });

  /* quick chips */
  const chips = onDashboard
    ? ["ملخص الأداء", "كيف أحجز؟", "تواصل معنا"]
    : ["كيف أحجز؟", "الأسعار", "اقرئي الصفحة", "تتبع الرحلة"];
  chips.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", () => { addMsg("user", c); respond(c); });
    chipsEl.appendChild(b);
  });

  /* ============ open / close ============ */
  function setOpen(v) {
    open = v;
    panel.hidden = !v;
    launcher.classList.toggle("open", v);
    launcher.setAttribute("aria-expanded", String(v));
    if (v) {
      if (!greeted) {
        greeted = true;
        addMsg("aria", "أهلاً بك — أنا أريا، المساعدة الذكية لنيكسيوس. اسألني عن الحجز أو الأسعار أو الوجهات، أو فعّل أيقونة المحادثة أعلى اليمين لنتحدث صوتياً 🎙");
      }
      field.focus();
    } else {
      // closing kills every sound and mic — nothing runs in the background
      voiceMode = false;
      stopListening();
      silence();
    }
  }

  launcher.addEventListener("click", () => setOpen(!open));
  panel.querySelector("#ariaClose").addEventListener("click", () => setOpen(false));

  /* never keep talking or listening after leaving the page */
  addEventListener("pagehide", () => { voiceMode = false; stopListening(); silence(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { voiceMode = false; stopListening(); silence(); }
  });
})();
