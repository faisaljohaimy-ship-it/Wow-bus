/* ============================================================
   Neexios — neexios.com
   Interactivity: nav, i18n (ar/en), counters, reveal, forms
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Translations ---------- */
  const I18N = {
    ar: {
      nav_home: "الرئيسية",
      nav_features: "المميزات",
      nav_routes: "الوجهات",
      nav_how: "كيف نعمل",
      nav_faq: "الأسئلة الشائعة",
      nav_contact: "تواصل معنا",
      nav_book: "احجز الآن",
      hero_badge: "🚌 منصة الحجز الأولى للرحلات البرية",
      hero_title: "سافر بذكاء،<br>واحجز رحلتك في ثوانٍ",
      hero_sub: "قارن الأسعار بين شركات النقل، اختر مقعدك المفضل، وتتبّع رحلتك لحظة بلحظة — كل ذلك من مكان واحد.",
      stat_routes: "وجهة",
      stat_partners: "شركة نقل",
      stat_travelers: "مسافر سعيد",
      book_title: "ابحث عن رحلتك",
      book_from: "من",
      book_to: "إلى",
      book_select: "اختر المدينة",
      book_date: "تاريخ السفر",
      book_passengers: "المسافرون",
      book_search: "ابحث عن الرحلات",
      book_err_same: "لا يمكن أن تكون مدينة الانطلاق والوصول نفسها.",
      book_err_missing: "يرجى تعبئة جميع الحقول.",
      book_ok: "جاري البحث عن الرحلات المتاحة… (نسخة تجريبية)",
      trust_1: "دفع آمن 100%",
      trust_2: "دعم على مدار الساعة",
      trust_3: "إلغاء مجاني قبل ٢٤ ساعة",
      trust_4: "تقييم 4.8 من المسافرين",
      feat_tag: "لماذا نيكسيوس؟",
      feat_title: "كل ما تحتاجه لرحلة مريحة",
      feat_sub: "صممنا نيكسيوس ليكون رفيقك الأمثل في كل رحلة برية، من لحظة البحث حتى الوصول.",
      feat_1_t: "مقارنة شاملة",
      feat_1_d: "قارن الأسعار والمواعيد ومستوى الخدمة بين عشرات شركات النقل في شاشة واحدة.",
      feat_2_t: "اختيار المقعد",
      feat_2_d: "شاهد مخطط الباص واختر مقعدك المفضل — نافذة، ممر، أو بجانب العائلة.",
      feat_3_t: "تتبع مباشر",
      feat_3_d: "اعرف موقع الباص لحظة بلحظة وشارك رحلتك مع من تحب لمزيد من الاطمئنان.",
      feat_4_t: "دفع مرن وآمن",
      feat_4_d: "ادفع بالبطاقة أو المحفظة الرقمية أو Apple Pay مع تشفير كامل لبياناتك.",
      feat_5_t: "دعم فوري",
      feat_5_d: "فريق دعم يتحدث لغتك ومتاح على مدار الساعة عبر الشات والهاتف.",
      feat_6_t: "نقاط ومكافآت",
      feat_6_d: "اكسب نقاطاً مع كل حجز واستبدلها بخصومات ورحلات مجانية.",
      routes_tag: "الأكثر طلباً",
      routes_title: "وجهات شائعة",
      routes_sub: "أسعار تبدأ من مستويات منافسة على أكثر المسارات طلباً.",
      route_daily: "رحلات يومية",
      route_hourly: "كل ساعة",
      route_weekly: "رحلات أسبوعية",
      how_tag: "ثلاث خطوات فقط",
      how_title: "كيف تحجز مع نيكسيوس؟",
      how_1_t: "ابحث",
      how_1_d: "أدخل وجهتك وتاريخ سفرك وشاهد جميع الرحلات المتاحة فوراً.",
      how_2_t: "اختر",
      how_2_d: "قارن الأسعار والمواعيد واختر الرحلة والمقعد الأنسب لك.",
      how_3_t: "سافر",
      how_3_d: "ادفع بأمان واستلم تذكرتك الإلكترونية على جوالك مباشرة.",
      app_title: "حمّل تطبيق نيكسيوس",
      app_sub: "احجز، تتبّع، وأدر رحلاتك من جوالك — التطبيق قريباً على المتاجر.",
      testi_tag: "آراء المسافرين",
      testi_title: "قالوا عن نيكسيوس",
      testi_1: "“تجربة حجز سلسة جداً، اخترت مقعدي ووصلتني التذكرة خلال ثوانٍ. أنصح به بشدة.”",
      testi_1_n: "عبدالله المطيري",
      testi_1_r: "الرياض → جدة",
      testi_2: "“ميزة تتبع الرحلة طمأنت عائلتي طول الطريق. خدمة العملاء ممتازة وسريعة.”",
      testi_2_n: "نورة الشهري",
      testi_2_r: "جدة → مكة المكرمة",
      testi_3: "“وفرت أكثر من ٣٠٪ بمقارنة الأسعار بين الشركات. التطبيق أصبح رفيقي في كل سفرة.”",
      testi_3_n: "محمد العتيبي",
      testi_3_r: "الدمام → الرياض",
      faq_tag: "مساعدة",
      faq_title: "الأسئلة الشائعة",
      faq_1_q: "كيف أستلم تذكرتي بعد الحجز؟",
      faq_1_a: "تصلك التذكرة الإلكترونية فوراً عبر البريد الإلكتروني والرسائل النصية، ويمكنك عرضها من حسابك في أي وقت — لا حاجة لطباعتها.",
      faq_2_q: "هل يمكنني إلغاء أو تعديل حجزي؟",
      faq_2_a: "نعم، يمكنك الإلغاء مجاناً قبل موعد الرحلة بـ٢٤ ساعة واسترداد المبلغ كاملاً، أو تعديل موعد الرحلة حسب سياسة شركة النقل.",
      faq_3_q: "ما وسائل الدفع المتاحة؟",
      faq_3_a: "ندعم بطاقات مدى وفيزا وماستركارد، بالإضافة إلى Apple Pay والمحافظ الرقمية، بتشفير كامل لجميع المعاملات.",
      faq_4_q: "هل يوجد خصومات للمجموعات؟",
      faq_4_a: "نعم، نوفر أسعاراً خاصة للمجموعات من ١٠ أشخاص فأكثر. تواصل مع فريقنا وسنجهز لك عرضاً مخصصاً.",
      faq_5_q: "كيف أتتبع رحلتي؟",
      faq_5_a: "بعد تأكيد الحجز، يظهر لك زر «تتبع الرحلة» في صفحة التذكرة يعرض موقع الباص على الخريطة لحظة بلحظة.",
      contact_tag: "تواصل معنا",
      contact_title: "نحن هنا لمساعدتك",
      contact_sub: "لديك سؤال أو اقتراح؟ راسلنا وسنرد عليك في أقرب وقت.",
      contact_name: "الاسم",
      contact_name_ph: "اسمك الكامل",
      contact_email: "البريد الإلكتروني",
      contact_msg: "رسالتك",
      contact_msg_ph: "اكتب رسالتك هنا...",
      contact_send: "إرسال الرسالة",
      contact_ok: "شكراً لك! تم استلام رسالتك وسنتواصل معك قريباً.",
      contact_err: "يرجى تعبئة جميع الحقول بشكل صحيح.",
      footer_about: "منصة ذكية لحجز رحلات الباصات — سافر بذكاء وراحة وأمان.",
      footer_links: "روابط سريعة",
      footer_legal: "قانوني",
      footer_terms: "الشروط والأحكام",
      footer_privacy: "سياسة الخصوصية",
      footer_refund: "سياسة الاسترداد",
      footer_contact: "تواصل",
      footer_rights: "جميع الحقوق محفوظة",
      footer_dash: "لوحة التحكم",
    },
    en: {
      nav_home: "Home",
      nav_features: "Features",
      nav_routes: "Routes",
      nav_how: "How it works",
      nav_faq: "FAQ",
      nav_contact: "Contact",
      nav_book: "Book now",
      hero_badge: "🚌 The #1 platform for intercity bus travel",
      hero_title: "Travel smart,<br>book your trip in seconds",
      hero_sub: "Compare prices across carriers, pick your favorite seat, and track your trip in real time — all in one place.",
      stat_routes: "Destinations",
      stat_partners: "Carriers",
      stat_travelers: "Happy travelers",
      book_title: "Find your trip",
      book_from: "From",
      book_to: "To",
      book_select: "Select a city",
      book_date: "Travel date",
      book_passengers: "Passengers",
      book_search: "Search trips",
      book_err_same: "Origin and destination cannot be the same.",
      book_err_missing: "Please fill in all fields.",
      book_ok: "Searching for available trips… (demo)",
      trust_1: "100% secure payment",
      trust_2: "24/7 support",
      trust_3: "Free cancellation up to 24h",
      trust_4: "Rated 4.8 by travelers",
      feat_tag: "Why Neexios?",
      feat_title: "Everything you need for a comfortable trip",
      feat_sub: "We built Neexios to be your perfect companion on every road trip, from search to arrival.",
      feat_1_t: "Full comparison",
      feat_1_d: "Compare prices, schedules and service levels across dozens of carriers on one screen.",
      feat_2_t: "Seat selection",
      feat_2_d: "View the bus layout and pick your favorite seat — window, aisle, or next to family.",
      feat_3_t: "Live tracking",
      feat_3_d: "See the bus location in real time and share your trip with loved ones for peace of mind.",
      feat_4_t: "Flexible, secure payment",
      feat_4_d: "Pay by card, digital wallet, or Apple Pay with full encryption of your data.",
      feat_5_t: "Instant support",
      feat_5_d: "A support team that speaks your language, available 24/7 via chat and phone.",
      feat_6_t: "Points & rewards",
      feat_6_d: "Earn points with every booking and redeem them for discounts and free trips.",
      routes_tag: "Most popular",
      routes_title: "Popular routes",
      routes_sub: "Competitive fares on the most in-demand routes.",
      route_daily: "Daily trips",
      route_hourly: "Every hour",
      route_weekly: "Weekly trips",
      how_tag: "Just three steps",
      how_title: "How do you book with Neexios?",
      how_1_t: "Search",
      how_1_d: "Enter your destination and travel date to instantly see all available trips.",
      how_2_t: "Choose",
      how_2_d: "Compare prices and schedules, then pick the trip and seat that suit you.",
      how_3_t: "Travel",
      how_3_d: "Pay securely and receive your e-ticket on your phone right away.",
      app_title: "Get the Neexios app",
      app_sub: "Book, track, and manage your trips from your phone — coming soon to app stores.",
      testi_tag: "Traveler reviews",
      testi_title: "What people say about Neexios",
      testi_1: "“A super smooth booking experience — I picked my seat and got my ticket in seconds. Highly recommended.”",
      testi_1_n: "Abdullah Almutairi",
      testi_1_r: "Riyadh → Jeddah",
      testi_2: "“Live tracking kept my family reassured the whole way. Customer service is excellent and fast.”",
      testi_2_n: "Noura Alshehri",
      testi_2_r: "Jeddah → Makkah",
      testi_3: "“I saved over 30% by comparing carriers. The app is now my companion on every trip.”",
      testi_3_n: "Mohammed Alotaibi",
      testi_3_r: "Dammam → Riyadh",
      faq_tag: "Help",
      faq_title: "Frequently asked questions",
      faq_1_q: "How do I receive my ticket after booking?",
      faq_1_a: "Your e-ticket arrives instantly via email and SMS, and you can view it from your account anytime — no printing needed.",
      faq_2_q: "Can I cancel or modify my booking?",
      faq_2_a: "Yes — cancel free of charge up to 24 hours before departure for a full refund, or reschedule per the carrier's policy.",
      faq_3_q: "What payment methods are available?",
      faq_3_a: "We support mada, Visa, and Mastercard, plus Apple Pay and digital wallets — all transactions fully encrypted.",
      faq_4_q: "Are there group discounts?",
      faq_4_a: "Yes, we offer special rates for groups of 10 or more. Contact our team for a custom quote.",
      faq_5_q: "How do I track my trip?",
      faq_5_a: "After booking, a “Track trip” button appears on your ticket page showing the bus location on the map in real time.",
      contact_tag: "Contact us",
      contact_title: "We're here to help",
      contact_sub: "Have a question or suggestion? Write to us and we'll get back to you soon.",
      contact_name: "Name",
      contact_name_ph: "Your full name",
      contact_email: "Email",
      contact_msg: "Your message",
      contact_msg_ph: "Write your message here...",
      contact_send: "Send message",
      contact_ok: "Thank you! We received your message and will get back to you soon.",
      contact_err: "Please fill in all fields correctly.",
      footer_about: "A smart bus booking platform — travel smart, comfortably, and safely.",
      footer_links: "Quick links",
      footer_legal: "Legal",
      footer_terms: "Terms & conditions",
      footer_privacy: "Privacy policy",
      footer_refund: "Refund policy",
      footer_contact: "Contact",
      footer_rights: "All rights reserved",
      footer_dash: "Dashboard",
    },
  };

  let lang = localStorage.getItem("neexios_lang") || "ar";

  function t(key) {
    return (I18N[lang] && I18N[lang][key]) || I18N.ar[key] || key;
  }

  function applyLang() {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      el.placeholder = t(el.getAttribute("data-i18n-ph"));
    });

    const toggle = document.getElementById("langToggle");
    if (toggle) toggle.textContent = lang === "ar" ? "EN" : "عربي";

    document.title =
      lang === "ar"
        ? "Neexios | نيكسيوس — منصة حجز رحلات الباصات الذكية"
        : "Neexios — Smart bus booking platform";
  }

  /* ---------- Header / nav ---------- */
  const header = document.getElementById("header");
  const nav = document.getElementById("nav");
  const menuToggle = document.getElementById("menuToggle");

  window.addEventListener("scroll", function () {
    header.classList.toggle("scrolled", window.scrollY > 10);
  }, { passive: true });

  menuToggle.addEventListener("click", function () {
    const open = nav.classList.toggle("open");
    menuToggle.classList.toggle("open", open);
    menuToggle.setAttribute("aria-expanded", open);
  });

  nav.addEventListener("click", function (e) {
    if (e.target.classList.contains("nav-link")) {
      nav.classList.remove("open");
      menuToggle.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });

  /* Active link highlighting via section observation */
  const sections = document.querySelectorAll("main section[id]");
  const navLinks = document.querySelectorAll(".nav-link");
  const sectionObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.classList.toggle(
            "active",
            link.getAttribute("href") === "#" + entry.target.id
          );
        });
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach(function (s) { sectionObserver.observe(s); });

  /* ---------- Reveal on scroll ---------- */
  const revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach(function (el) {
    revealObserver.observe(el);
  });

  /* ---------- Animated counters ---------- */
  function animateCount(el) {
    const target = parseInt(el.getAttribute("data-count"), 10);
    const suffix = el.getAttribute("data-suffix") || "";
    const duration = 1600;
    const start = performance.now();

    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString("en-US") + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  const countObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll("[data-count]").forEach(function (el) {
    countObserver.observe(el);
  });

  /* ---------- Booking form ---------- */
  const bookingForm = document.getElementById("bookingForm");
  const formMsg = document.getElementById("formMsg");
  const dateInput = document.getElementById("date");

  if (dateInput) {
    dateInput.min = new Date().toISOString().split("T")[0];
  }

  bookingForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;
    const date = dateInput.value;

    formMsg.classList.remove("ok", "err");

    if (!from || !to || !date) {
      formMsg.textContent = t("book_err_missing");
      formMsg.classList.add("err");
      return;
    }
    if (from === to) {
      formMsg.textContent = t("book_err_same");
      formMsg.classList.add("err");
      return;
    }
    formMsg.textContent = t("book_ok");
    formMsg.classList.add("ok");
  });

  /* ---------- Contact form ---------- */
  const contactForm = document.getElementById("contactForm");
  const contactMsg = document.getElementById("contactMsg");

  contactForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = document.getElementById("cname").value.trim();
    const email = document.getElementById("cemail").value.trim();
    const msg = document.getElementById("cmsg").value.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    contactMsg.classList.remove("ok", "err");

    if (!name || !emailOk || !msg) {
      contactMsg.textContent = t("contact_err");
      contactMsg.classList.add("err");
      return;
    }
    contactMsg.textContent = t("contact_ok");
    contactMsg.classList.add("ok");
    contactForm.reset();
  });

  /* ---------- Language toggle ---------- */
  document.getElementById("langToggle").addEventListener("click", function () {
    lang = lang === "ar" ? "en" : "ar";
    localStorage.setItem("neexios_lang", lang);
    applyLang();
  });

  /* ---------- Footer year ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- Aria voice: what she reads (localized) ---------- */
  window.ARIA_TEXT = function () {
    if (lang === "ar") {
      return (
        "مرحباً بك في نيكسيوس، منصة حجز رحلات الباصات الذكية. " +
        "قارن الأسعار بين شركات النقل، اختر مقعدك المفضل، وتتبع رحلتك لحظة بلحظة. " +
        "ابحث عن رحلتك الآن من نموذج الحجز، أو تصفح الوجهات الشائعة والأسئلة المتكررة. " +
        "سافر بذكاء وراحة وأمان مع نيكسيوس."
      );
    }
    return (
      "Welcome to Neexios, the smart bus booking platform. " +
      "Compare prices across carriers, pick your favorite seat, and track your trip in real time. " +
      "Search for your trip in the booking form, or browse popular routes and frequently asked questions. " +
      "Travel smart, comfortably, and safely with Neexios."
    );
  };

  /* ---------- Init ---------- */
  if (lang !== "ar") applyLang();
})();
