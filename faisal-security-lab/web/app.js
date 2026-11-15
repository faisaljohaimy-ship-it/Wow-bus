/* FAISAL.AI defensive console — vanilla SPA, CSP-safe (event delegation). */
"use strict";
const S = { token: localStorage.getItem("fsl_token") || "", user: null,
  lang: localStorage.getItem("fsl_lang") || "ar", projects: [], project: null,
  screen: "dashboard", connectors: [], drawer: null,
  publicView: false,   // server offers a read-only public view
  guest: false,        // browsing that view without signing in
  loginOpen: false };  // a guest asked for the owner sign-in form

const I18N = {
  ar: { app:"مركز الدفاع السيبراني", kicker:"PRIVATE DEFENSE SYSTEM",
    login:"دخول المالك الموثّق", email:"البريد", password:"كلمة المرور", signin:"دخول",
    signout:"خروج", dashboard:"لوحة القيادة", assets:"الأصول والنطاقات", catalog:"كتالوج الأدوات",
    scans:"مركز الفحوص", findings:"الثغرات والأدلة", ailab:"مختبر أمن AI", reports:"التقارير",
    audit:"سجل التدقيق", settings:"الإعدادات", project:"المشروع", newproject:"مشروع جديد",
    create:"إنشاء", name:"الاسم", jobs:"المهام", severity:"الشدة", status:"الحالة", tool:"الأداة",
    location:"الموقع", priority:"الأولوية", verification:"التحقق", run:"تشغيل فحص", stop:"إيقاف",
    connector:"الموصل", asset:"الأصل", scope:"النطاق", kind:"النوع", identifier:"المعرّف",
    addasset:"إضافة أصل", addscope:"إضافة تفويض", revoke:"سحب التفويض", proof:"دليل التفويض",
    scantypes:"أنواع الفحص المسموحة", allowed:"الأهداف المسموحة", environment:"البيئة",
    findings_total:"إجمالي النتائج", verified_fixes:"إصلاحات متحقَّقة", activescopes:"تفويضات نشطة",
    toolstate:"حالة الأدوات", remediation:"إصلاح مقترح", triage:"فرز ذكي", validate:"تحقق",
    evidence:"الأدلة", aistatus:"حالة الذكاء الاصطناعي", evalset:"اختبار سلامة المدخلات",
    runeval:"تشغيل مجموعة التقييم", plan:"خطة فحص مقترحة", genreport:"توليد تقرير",
    globalstop:"الإيقاف الشامل", engaged:"مُفعّل", disengaged:"متوقف", users:"المستخدمون",
    adduser:"إضافة مستخدم", role:"الدور", lang:"EN", none:"—", close:"إغلاق",
    noproject:"أنشئ مشروعًا أو اختر واحدًا للبدء.", confirm:"تأكيد", owner_contact:"جهة اتصال المالك",
    criticality:"الأهمية", unauthorized:"غير مصرح — راجع النطاق.", refresh:"تحديث",
    publicview:"عرض عام للقراءة فقط. تشغيل الفحوص وأي تعديل يتطلب دخول المالك.",
    ownerlogin:"دخول المالك", backpublic:"العودة للعرض العام",
    motion_stop:"إيقاف الحركة", motion_start:"تشغيل الحركة",
    preparing:"يجري تجهيز العرض التوضيحي. حدّث الصفحة بعد لحظات.",
    open:"فتح", download:"تنزيل", report_note:"التقارير منقّحة: القيم الحساسة محجوبة.",
    throttled:"محاولات دخول خاطئة كثيرة من هذا الجهاز. انتظر {m} دقيقة ثم حاول من جديد.",
    signinbusy:"تسجيل الدخول مشغول الآن. انتظر بضع ثوانٍ ثم حاول من جديد.",
    badlogin:"البريد أو كلمة المرور غير صحيحة.",
    unavailable:"الخدمة مشغولة الآن أو الاتصال ضعيف. انتظر قليلًا ثم حاول من جديد.", retry:"إعادة المحاولة",
    ftitle:"العنوان",
    connection:"الاتصال", yourip:"عنوانك كما يراه الخادم", ipsource:"مصدر العنوان",
    src_header:"ترويسة منصّة الاستضافة", src_forwarded:"X-Forwarded-For", src_peer:"اتصال مباشر",
    proxywarn:"تصل الطلبات عبر وسيط لكن الخادم غير مضبوط للوثوق به، فيظهر كل الزوّار بعنوان واحد وتُحتسب محاولات الدخول الخاطئة عليهم جميعًا. اضبط FSL_CLIENT_IP_HEADER في إعدادات الاستضافة.",
    setupnotes:"ملاحظات الإعداد" },
  en: { app:"Cyber Defense Center", kicker:"PRIVATE DEFENSE SYSTEM",
    login:"Verified owner sign-in", email:"Email", password:"Password", signin:"Sign in",
    signout:"Sign out", dashboard:"Dashboard", assets:"Assets & Scopes", catalog:"Tool Catalog",
    scans:"Scan Center", findings:"Findings & Evidence", ailab:"AI Security Lab", reports:"Reports",
    audit:"Audit Log", settings:"Settings", project:"Project", newproject:"New project",
    create:"Create", name:"Name", jobs:"Jobs", severity:"Severity", status:"Status", tool:"Tool",
    location:"Location", priority:"Priority", verification:"Verification", run:"Run scan", stop:"Stop",
    connector:"Connector", asset:"Asset", scope:"Scope", kind:"Kind", identifier:"Identifier",
    addasset:"Add asset", addscope:"Add authorization", revoke:"Revoke", proof:"Authorization proof",
    scantypes:"Allowed scan types", allowed:"Allowed targets", environment:"Environment",
    findings_total:"Total findings", verified_fixes:"Verified fixes", activescopes:"Active scopes",
    toolstate:"Tool states", remediation:"Remediation", triage:"AI triage", validate:"Validate",
    evidence:"Evidence", aistatus:"AI status", evalset:"Input-safety eval", runeval:"Run eval set",
    plan:"Proposed scan plan", genreport:"Generate report", globalstop:"Global stop",
    engaged:"ENGAGED", disengaged:"off", users:"Users", adduser:"Add user", role:"Role",
    lang:"ع", none:"—", close:"Close", noproject:"Create or pick a project to begin.",
    confirm:"Confirm", owner_contact:"Owner contact", criticality:"Criticality",
    unauthorized:"Not authorized — check scope.", refresh:"Refresh",
    publicview:"Public read-only view. Running scans or changing anything requires the owner to sign in.",
    ownerlogin:"Owner sign-in", backpublic:"Back to the public view",
    motion_stop:"Pause motion", motion_start:"Resume motion",
    preparing:"The demo is being prepared. Refresh in a moment.",
    open:"Open", download:"Download", report_note:"Reports are redacted: sensitive values are withheld.",
    throttled:"Too many wrong sign-in attempts from this device. Wait {m} minutes, then try again.",
    signinbusy:"Sign-in is busy right now. Wait a few seconds, then try again.",
    badlogin:"The email or the password is not correct.",
    unavailable:"The service is busy or the connection is weak. Wait a moment, then try again.", retry:"Try again",
    ftitle:"Title",
    connection:"Connection", yourip:"Your address as the server sees it", ipsource:"Address source",
    src_header:"hosting platform header", src_forwarded:"X-Forwarded-For", src_peer:"direct connection",
    proxywarn:"Requests arrive through a proxy the server is not set to trust, so every visitor appears under one address and wrong sign-in attempts count against all of them. Set FSL_CLIENT_IP_HEADER in the hosting settings.",
    setupnotes:"Setup notes" }
};
const t = k => (I18N[S.lang][k] || k);

// Startup problems reported by the server as stable codes (see /api/config).
const NOTICE_TEXT = {
  ar: {
    owner_password_too_short: "لم يُنشأ حساب المالك لأن كلمة المرور في إعدادات الاستضافة أقصر من {min} أحرف. افتح إعدادات الخدمة (Environment) واجعل قيمة FSL_OWNER_PASSWORD {min} أحرف أو أكثر، ثم أعد النشر.",
    owner_email_invalid: "قيمة FSL_OWNER_EMAIL في إعدادات الاستضافة ليست بريدًا صالحًا، لذلك يُستخدم البريد الافتراضي owner@faisal-security-lab.local لتسجيل الدخول.",
    owner_password_generated: "لم تُضبط كلمة مرور للمالك (FSL_OWNER_PASSWORD). أُنشئت كلمة مرور لمرة واحدة وطُبعت في سجل الخدمة (Logs).",
    data_dir_unwritable: "مجلد البيانات غير قابل للكتابة، لذلك تُحفظ البيانات مؤقتًا وتُفقد عند إعادة التشغيل.",
    owner_bootstrap_failed: "تعذّر إعداد حساب المالك. راجع سجل الخدمة (Logs).",
    owner_email_ignored: "قيمة FSL_OWNER_EMAIL في إعدادات الاستضافة ليست بريدًا صالحًا فتم تجاهلها. حسابات المالك الموجودة لم تتغيّر.",
    running_as_root: "تعذّر على الحاوية التخلي عن صلاحيات root، فالخدمة وأدوات الفحص تعمل بصلاحيات root.",
    demo_sample_missing: "ملفات العرض التوضيحي غير موجودة في هذه النسخة، لذلك العرض العام فارغ.",
    public_view_unrecognized: "قيمة FSL_PUBLIC_VIEW في إعدادات الاستضافة غير مفهومة، لذلك الدخول العام متوقف. اكتب 1 لتشغيله."
  },
  en: {
    owner_password_too_short: "No owner account was created because the password in the hosting settings is shorter than {min} characters. Open the service's Environment settings, set FSL_OWNER_PASSWORD to {min} or more characters, and redeploy.",
    owner_email_invalid: "FSL_OWNER_EMAIL in the hosting settings is not a valid email, so the default owner@faisal-security-lab.local is used to sign in.",
    owner_password_generated: "No owner password is set (FSL_OWNER_PASSWORD). A one-time password was generated and printed in the service logs.",
    data_dir_unwritable: "The data directory is not writable, so data is kept in temporary storage and lost on restart.",
    owner_bootstrap_failed: "The owner account could not be set up. Check the service logs.",
    owner_email_ignored: "FSL_OWNER_EMAIL in the hosting settings is not a valid email and was ignored. Existing owner accounts are unchanged.",
    running_as_root: "The container could not drop root privileges, so the service and its scan tools run as root.",
    demo_sample_missing: "The demo files are missing from this build, so the public view is empty.",
    public_view_unrecognized: "FSL_PUBLIC_VIEW in the hosting settings has a value that is not understood, so the public view is off. Use 1 to turn it on."
  }
};
async function loadSetupNotices(){
  try{
    const c = await api("/api/config");
    const box = document.getElementById("setupnotices");
    if (!box) return;
    const min = c.min_password_length || 10;
    const blocking = ["owner_password_too_short","owner_bootstrap_failed"];
    box.innerHTML = (c.setup_notices||[]).map(code => {
      const text = (NOTICE_TEXT[S.lang][code] || code).replace(/\{min\}/g, min);
      return notice(text, blocking.includes(code) ? "err" : "");
    }).join("");
  }catch(e){ /* the sign-in form still works without the notices */ }
}

// ---- api ----
async function api(path, method="GET", body=null){
  const h = { "Content-Type":"application/json" };
  if (S.token) h["Authorization"] = "Bearer " + S.token;
  const res = await fetch(path, { method, headers:h, body: body?JSON.stringify(body):null });
  const text = await res.text();
  let data; try { data = text?JSON.parse(text):{}; } catch(e){ data = {raw:text}; }
  if (!res.ok) throw Object.assign(new Error((data.error&&data.error.message)||res.statusText),
    {status:res.status, code:(data.error&&data.error.code), detail:(data.error&&data.error.detail)});
  return data;
}
async function apiRaw(path){
  const h = {};
  if (S.token) h["Authorization"] = "Bearer " + S.token;
  const res = await fetch(path, { headers:h });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + " " + res.statusText);
  return { text, type: res.headers.get("Content-Type") || "text/plain" };
}
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// A link target taken from data is used only when it is an http(s) address.
const safeUrl = u => /^https?:\/\//i.test(String(u||"")) ? String(u) : "#";
const h = (strings,...v)=>strings.map((s,i)=>s+(v[i]!=null?v[i]:"")).join("");

// ---- shell / render ----
const root = () => document.getElementById("root");
function setLang(l){ S.lang=l; localStorage.setItem("fsl_lang",l);
  document.documentElement.lang=l; document.documentElement.dir = l==="ar"?"rtl":"ltr"; render(); }

// The owner's hooded-mask mark, ringed by two lasers that never stop circling.
const MASK_OUTLINE = "M40 3C24 4 10 20 5 48l10 23 25 14 25-14 10-23C70 20 56 4 40 3Z";
function MASK(size=""){
  return `<svg class="mask ${size}" viewBox="-8 -8 96 104" aria-hidden="true" focusable="false">
    <path class="laser two" d="${MASK_OUTLINE}" transform="translate(40 44) scale(1.16) translate(-40 -44)" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="9 41" pathLength="100"/>
    <path d="${MASK_OUTLINE}" fill="#130a0e" stroke="#bd203e" stroke-width="1.7"/>
    <path d="M40 14 18 38l4 25 18 15 18-15 4-25Z" fill="#e9e1e4" stroke="#8f263e" stroke-width="1.4"/>
    <path d="m21 38 12 4-4 6-9-5m39-5-12 4 4 6 9-5" fill="#10080b"/>
    <path d="m23 33 11 5m23-5-11 5" fill="none" stroke="#971f3b" stroke-width="3" stroke-linecap="round"/>
    <path d="m39 41-4 15 5 3 5-3-4-15m-12 20 11 5 11-5m-16 9 5 3 5-3" fill="none" stroke="#561728" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m25 48 6 4-5 4m29-8-6 4 5 4" fill="none" stroke="#bc8a97" stroke-width="1.4"/>
    <path d="m17 30-6 20 8 18m44-38 6 20-8 18" fill="none" stroke="#60172b" stroke-width="1.5"/>
    <path d="m24 42 5 2m22 0 5-2" stroke="#f22b50" stroke-width="2" stroke-linecap="round"/>
    <path class="laser" d="${MASK_OUTLINE}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="18 82" pathLength="100"/>
  </svg>`;
}

// Lines for the moving code strips (decorative; they describe what the platform does).
const CODE = [
  "scope.check(target); verify(owner); audit.record(event); policy.allow(job);",
  "queue.lease(job, ttl=120); worker.run(connector, sandbox); evidence.redact(raw);",
  "findings.dedup(key); priority = severity * criticality; report.build(lang);",
  "if (!scope.active) return DENY; ssrf.block(private_ip); session.verify(token);",
  "semgrep.scan(src); gitleaks.detect(src); bandit.audit(src); pip_audit.check(deps);",
  "laser.orbit(mask); shield.up(); trace.log(sha256(evidence)); gate.pass(10, 10);"
];
function ticker(i, cls=""){
  const half = (CODE[i % CODE.length] + "    ").repeat(5);
  return `<div class="codebar ${cls}" aria-hidden="true"><span>${esc(half + half)}</span></div>`;
}
function codeHero(){
  return `<div class="codehero" aria-hidden="true">${ticker(0,"slow")}${ticker(4,"rev")}${ticker(2,"fast")}</div>`;
}

// Motion: on by default; follows the device's reduced-motion setting until the
// visitor chooses, and can always be paused or resumed from the page.
function motionPref(){ try{ return localStorage.getItem("fsl_motion") || ""; }catch(e){ return ""; } }
function motionIsOn(){
  const pref = motionPref();
  if (pref) return pref === "on";
  return !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function applyMotion(){
  const pref = motionPref();
  document.documentElement.classList.toggle("motion", pref === "on");
  document.documentElement.classList.toggle("nomotion", pref === "off");
}
function toggleMotion(){
  try{ localStorage.setItem("fsl_motion", motionIsOn() ? "off" : "on"); }catch(e){}
  applyMotion(); render();
}

// Every card gets its own mask and code strip; wide tables scroll inside the card;
// in the public view the owner-only controls are hidden.
const OWNER_ACTS = ["revoke","scopeform","jobstop","runeval","aiplan","aireport","togglestop",
  "ftriage","fremediate","fvalidate","fstatus","evread"].map(a => `[data-act="${a}"]`).join(",");
let CARD_SEQ = 0;
function decorate(){
  // Guest styling hides every form; the owner sign-in form a guest asked for is not one of them.
  document.body.classList.toggle("guest", S.guest && !S.token && !S.loginOpen);
  document.querySelectorAll(".card,.stat,.login,.drawer").forEach(el => {
    const first = el.firstElementChild;
    if (first && first.classList.contains("cardhead")) return;
    const i = CARD_SEQ++;
    el.insertAdjacentHTML("afterbegin",
      `<div class="cardhead" aria-hidden="true">${MASK("sm")}${ticker(i, i % 2 ? "rev" : "")}</div>`);
  });
  document.querySelectorAll(".card table,.drawer table").forEach(tb => {
    if (tb.parentElement.classList.contains("tablewrap")) return;
    const wrap = document.createElement("div"); wrap.className = "tablewrap";
    tb.parentNode.insertBefore(wrap, tb); wrap.appendChild(tb);
  });
  // Name every cell after its column, so a phone can show a row as a list.
  document.querySelectorAll(".tablewrap > table").forEach(tb => {
    const heads = [...tb.querySelectorAll("thead th")].map(th => th.textContent.trim());
    if (!heads.length) return;
    tb.classList.add("stack");
    tb.querySelectorAll("tbody > tr").forEach(tr => [...tr.children].forEach((td, i) => {
      if (!td.hasAttribute("data-label") && !td.hasAttribute("colspan")) td.setAttribute("data-label", heads[i] || "");
    }));
  });
  if (S.guest && !S.token) document.querySelectorAll(OWNER_ACTS).forEach(el => el.setAttribute("data-owner",""));
}
let decoPending = false;
function watchDom(){
  new MutationObserver(() => {
    if (decoPending) return;
    decoPending = true;
    requestAnimationFrame(() => { decoPending = false; decorate(); });
  }).observe(document.getElementById("root"), { childList:true, subtree:true });
}

function render(){
  const guestView = S.guest && !S.token && !S.loginOpen;
  if (!S.token && !guestView){ return renderLogin(); }
  document.documentElement.dir = S.lang==="ar"?"rtl":"ltr";
  document.documentElement.lang = S.lang;
  let nav = ["dashboard","assets","catalog","scans","findings","ailab","reports","audit","settings"];
  if (guestView) nav = nav.filter(k => !["audit","settings"].includes(k));
  if (!nav.includes(S.screen)) S.screen = "dashboard";
  const projects = S.projects.map(p=>`<option value="${esc(p.id)}" ${S.project&&S.project.id===p.id?"selected":""}>${esc(p.name)}</option>`).join("")
    + (guestView ? "" : `<option value="__new">+ ${esc(t("newproject"))}</option>`);
  root().innerHTML = h`
    <div class="app">
      <aside class="sidebar">
        <div class="logo-row">${MASK()}<div><div class="brand" style="font-size:19px">FAISAL<span class="dot">.AI</span></div>
          <div class="kicker">${esc(t("kicker"))}</div></div></div>
        <div class="small muted">${esc(t("project"))}:</div>
        <select id="projsel" aria-label="${esc(t("project"))}">${projects || `<option>${esc(t("none"))}</option>`}</select>
        <nav class="nav">${nav.map(k=>`<button data-act="nav" data-screen="${k}" class="${S.screen===k?"active":""}">${MASK("sm")}<span>${esc(t(k))}</span></button>`).join("")}</nav>
        <div class="side-actions">
          <button class="btn sm" data-act="lang">🌐 ${esc(t("lang"))}</button>
          <button class="btn sm" data-act="motion">${motionIsOn()?"⏸ "+esc(t("motion_stop")):"▶ "+esc(t("motion_start"))}</button>
          ${guestView ? `<button class="btn sm primary" data-act="showlogin">${esc(t("ownerlogin"))}</button>`
                      : `<button class="btn sm" data-act="logout">⎋ ${esc(t("signout"))}</button>`}
        </div>
        <div class="whoami">${guestView ? "" : esc(S.user?S.user.email:"") + "<br>" + esc(S.user?S.user.global_role:"")}</div>
      </aside>
      <main class="main" id="main"><div class="notice">…</div></main>
    </div>${S.drawer||""}`;
  decorate();
  renderScreen();
}

function renderLogin(){
  root().innerHTML = h`<div class="loginwrap"><div class="login">
    <div class="hero">${MASK("lg")}
      <h1 class="brand">FAISAL<span class="dot">.AI</span></h1></div>
    <div class="sub kicker">${esc(t("kicker"))}</div>
    <div id="setupnotices"></div>
    <div id="loginmsg"></div>
    <form id="loginform">
      <label for="lf-email">${esc(t("email"))}</label><input id="lf-email" type="email" name="email" autocomplete="username" required>
      <label for="lf-pass">${esc(t("password"))}</label><input id="lf-pass" type="password" name="password" autocomplete="current-password" required>
      <div style="margin-top:16px" class="flex">
        <button class="btn primary" type="submit">${esc(t("signin"))}</button>
        <button class="btn sm right" type="button" data-act="lang">🌐 ${esc(t("lang"))}</button>
      </div>
    </form>
    <div class="flex" style="margin-top:12px">
      <button class="btn sm" type="button" data-act="motion">${motionIsOn()?"⏸ "+esc(t("motion_stop")):"▶ "+esc(t("motion_start"))}</button>
      ${S.publicView ? `<button class="btn sm" type="button" data-act="backpublic">${esc(t("backpublic"))}</button>` : ""}
    </div></div></div>`;
  decorate();
  loadSetupNotices();
}

function setMain(ctx, html){
  if (html === undefined){ html = ctx; ctx = null; }       // called without a render number
  if (ctx && ctx.seq !== RENDER_SEQ) return;               // a newer screen was asked for meanwhile
  const m = document.getElementById("main"); if (!m) return;
  const guestBar = (S.guest && !S.token)
    ? `<div class="guestbar"><span>${esc(t("publicview"))}</span><button class="btn sm primary right" data-act="showlogin">${esc(t("ownerlogin"))}</button></div>` : "";
  m.innerHTML = codeHero() + guestBar + html;
  decorate();
}
function notice(msg,cls=""){ return `<div class="notice ${cls}">${esc(msg)}</div>`; }

// ---------- screens ----------
// Every screen render gets a number. A screen that is still waiting for the
// server when the user has moved on must not write over the newer screen.
let RENDER_SEQ = 0;
async function renderScreen(){
  const ctx = { seq: ++RENDER_SEQ };
  try{
    if (S.screen==="dashboard") return await scrDashboard(ctx);
    if (!S.project && ["assets","scans","findings","reports"].includes(S.screen))
      return setMain(ctx, notice(t("noproject")));
    if (S.screen==="assets") return await scrAssets(ctx);
    if (S.screen==="catalog") return await scrCatalog(ctx);
    if (S.screen==="scans") return await scrScans(ctx);
    if (S.screen==="findings") return await scrFindings(ctx);
    if (S.screen==="ailab") return await scrAiLab(ctx);
    if (S.screen==="reports") return await scrReports(ctx);
    if (S.screen==="audit") return await scrAudit(ctx);
    if (S.screen==="settings") return await scrSettings(ctx);
  }catch(e){ setMain(ctx, notice(e.message + (e.code?` [${e.code}]`:""), "err")); }
}
function topbar(title, extra=""){ return h`<div class="topbar"><h1>${esc(title)}</h1><div class="spacer"></div>${extra}</div>`; }

async function scrDashboard(ctx){
  const pid = S.project?S.project.id:null;
  if (!pid && S.guest && !S.token)
    return setMain(ctx, topbar(t("dashboard"), `<button class="btn sm" data-act="reload">↻ ${esc(t("refresh"))}</button>`) + notice(t("preparing")));
  const m = await api("/api/metrics"+(pid?`?project=${pid}`:""));
  const ai = await api("/api/ai/status");
  const sev = m.findings_by_severity||{};
  const ts = m.tool_states||{};
  setMain(ctx, topbar(t("dashboard"),
      `<span class="pill ${ai.available?"ok":"warn"}">AI: ${esc(ai.available?ai.model||"on":"fallback")}</span>
       <button class="btn sm" data-act="refresh">↻ ${esc(t("refresh"))}</button>`)
    + h`<div class="grid cols-4">
      <div class="stat"><div class="n">${esc(m.findings_total||0)}</div><div class="l">${esc(t("findings_total"))}</div></div>
      <div class="stat"><div class="n">${esc(m.verified_fixes||0)}</div><div class="l">${esc(t("verified_fixes"))}</div></div>
      <div class="stat"><div class="n">${esc(m.assets||0)}</div><div class="l">${esc(t("assets"))}</div></div>
      <div class="stat"><div class="n">${esc(m.scopes_active||0)}</div><div class="l">${esc(t("activescopes"))}</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card"><h2>${esc(t("severity"))}</h2>${sevBars(sev)}</div>
      <div class="card"><h2>${esc(t("jobs"))}</h2>${kvTable(m.jobs_by_state||{})}</div>
    </div>
    <div class="card"><h2>${esc(t("toolstate"))}</h2>${kvTable(ts)}
      <div class="small muted" style="margin-top:8px">catalog: ${esc(JSON.stringify(m.catalog_states||{}))}</div></div>`);
}
function sevBars(sev){ const order=["critical","high","medium","low","info"];
  const max=Math.max(1,...order.map(s=>sev[s]||0));
  return order.map(s=>`<div style="margin:6px 0"><div class="flex small"><span class="badge sev-${s}">${s}</span>
    <span class="right mono">${esc(sev[s]||0)}</span></div>
    <div class="progress"><span style="width:${Number((sev[s]||0)/max*100)||0}%"></span></div></div>`).join("");
}
function kvTable(obj){ const k=Object.keys(obj); if(!k.length) return `<div class="muted small">${esc(t("none"))}</div>`;
  return `<table>${k.map(x=>`<tr><td>${esc(x)}</td><td class="mono right"><span class="state state-${esc(x)}">${esc(obj[x])}</span></td></tr>`).join("")}</table>`; }

async function scrAssets(ctx){
  const pid=S.project.id;
  const [a,sc,conn] = await Promise.all([api(`/api/projects/${pid}/assets`),
    api(`/api/projects/${pid}/scopes`), api(`/api/connectors`)]);
  S.connectors = conn.connectors;
  const connOpts = conn.connectors.map(c=>`<label class="small"><input type="checkbox" name="st" value="${esc(c.name)}"> ${esc(c.name)}</label>`).join(" ");
  setMain(ctx, topbar(t("assets"))
    + h`<div class="card"><h2>${esc(t("addasset"))}</h2>
      <form id="assetform" class="row">
        <div><label>${esc(t("kind"))}</label><select name="kind">
          <option value="source">source</option><option value="repo">repo</option>
          <option value="web">web</option><option value="api">api</option>
          <option value="host">host</option><option value="container">container</option></select></div>
        <div style="flex:2"><label>${esc(t("identifier"))}</label><input name="identifier" required placeholder="/path, https://…, image:tag"></div>
        <div><label>${esc(t("criticality"))}</label><select name="criticality">
          <option>low</option><option selected>medium</option><option>high</option><option>critical</option></select></div>
        <div><label>local_path (source)</label><input name="local_path" placeholder="optional"></div>
        <div><button class="btn primary">${esc(t("create"))}</button></div>
      </form></div>
    <div class="card"><h2>${esc(t("assets"))}</h2><table><thead><tr><th>${esc(t("kind"))}</th><th>${esc(t("identifier"))}</th><th>${esc(t("criticality"))}</th><th></th></tr></thead>
      <tbody>${a.assets.map(x=>`<tr><td>${esc(x.kind)}</td><td class="mono-sm">${esc(x.identifier)}</td><td>${esc(x.criticality)}</td>
        <td><button class="btn sm" data-act="scopeform" data-asset="${esc(x.id)}">+ ${esc(t("addscope"))}</button></td></tr>`).join("")||`<tr><td colspan=4 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>
    <div id="scopeformbox"></div>
    <div class="card"><h2>${esc(t("scope"))}</h2><table><thead><tr><th>${esc(t("asset"))}</th><th>${esc(t("environment"))}</th><th>${esc(t("scantypes"))}</th><th>${esc(t("status"))}</th><th></th></tr></thead>
      <tbody>${sc.scopes.map(x=>`<tr><td class="mono-sm">${esc(x.asset_id)}</td><td>${esc(x.environment)}</td>
        <td class="small">${esc((x.scan_types||[]).join(", "))}</td><td class="state state-${x.status==="active"?"ready":"blocked"}">${esc(x.status)}</td>
        <td>${x.status==="active"?`<button class="btn sm danger" data-act="revoke" data-scope="${esc(x.id)}">${esc(t("revoke"))}</button>`:""}</td></tr>`).join("")||`<tr><td colspan=5 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>
    <div id="_connopts" class="hidden">${connOpts}</div>`);
}

async function scrCatalog(ctx){
  const [cat,tools]=await Promise.all([api("/api/catalog"),api("/api/tools")]);
  const trMap={}; tools.tools.forEach(x=>trMap[x.name]=x);
  setMain(ctx, topbar(t("catalog"), `<span class="pill">${cat.tools.length} tools · ${cat.categories.length} categories</span>`)
    + h`<div class="card"><h2>${esc(t("connector"))} / ${esc(t("toolstate"))}</h2>
      <table><thead><tr><th>${esc(t("tool"))}</th><th>category</th><th>version</th><th>state</th><th>source</th></tr></thead>
      <tbody>${tools.tools.map(x=>`<tr><td class="mono">${esc(x.name)}</td><td class="small">${esc(x.category)}</td>
        <td class="small">${esc(x.version||"—")}</td><td class="state state-${esc(x.state)}">${esc(x.state)}</td>
        <td class="small"><a href="${esc(safeUrl(x.source))}" target="_blank" rel="noopener">${esc((x.source||"").replace("https://github.com/",""))}</a></td></tr>`).join("")}</tbody></table>
      <div class="small muted" style="margin-top:8px">states: catalog→installed→ready→verified; blocked/stale/disabled are distinct.</div></div>
    ${cat.categories.map(c=>`<div class="card"><h2>${esc(c.category)} <span class="muted small">(${esc(c.n)})</span></h2>
      <table>${cat.tools.filter(x=>x.category===c.category).map(x=>`<tr>
        <td class="mono-sm"><a href="https://github.com/${esc(x.repo)}" target="_blank" rel="noopener">${esc(x.repo)}</a></td>
        <td class="small">${esc(x.description)}</td>
        <td>${x.integration_state==="connector_available"?'<span class="pill ok">connector</span>':'<span class="pill">cataloged</span>'}${x.archived?' <span class="pill warn">archived</span>':""}</td></tr>`).join("")}</table></div>`).join("")}`);
}

async function scrScans(ctx){
  const pid=S.project.id;
  const [a,sc,conn,jobs]=await Promise.all([api(`/api/projects/${pid}/assets`),
    api(`/api/projects/${pid}/scopes`),api(`/api/connectors`),api(`/api/projects/${pid}/jobs`)]);
  const activeScopes=sc.scopes.filter(s=>s.status==="active");
  setMain(ctx, topbar(t("scans"), `<button class="btn sm" data-act="refresh">↻ ${esc(t("refresh"))}</button>`)
    + h`<div class="card"><h2>${esc(t("run"))}</h2>
      <form id="scanform" class="row">
        <div><label>${esc(t("scope"))}</label><select name="scope_id">${activeScopes.map(s=>`<option value="${esc(s.id)}" data-asset="${esc(s.asset_id)}" data-types="${esc(JSON.stringify(s.scan_types||[]))}">${esc(s.asset_id)} · ${esc(s.environment)}</option>`).join("")}</select></div>
        <div><label>${esc(t("connector"))}</label><select name="connector" id="connsel">${conn.connectors.map(c=>`<option value="${esc(c.name)}">${esc(c.name)} ${c.readiness.available?"":(c.state==="checking"?"(…)":"(blocked)")}</option>`).join("")}</select></div>
        <div><button class="btn primary">${esc(t("run"))}</button></div>
      </form><div class="small muted" style="margin-top:6px">${esc(t("unauthorized"))}</div></div>
    <div class="card"><h2>${esc(t("jobs"))}</h2><table><thead><tr><th>${esc(t("connector"))}</th><th>${esc(t("status"))}</th><th>phase</th><th>progress</th><th>${esc(t("tool"))}</th><th></th></tr></thead>
      <tbody>${jobs.jobs.map(j=>`<tr><td class="mono">${esc(j.connector)}</td><td class="state state-${esc(j.state)}">${esc(j.state)}</td>
        <td class="small">${esc(j.phase)}</td><td style="width:120px"><div class="progress"><span style="width:${Math.round((Number(j.progress)||0)*100)}%"></span></div></td>
        <td class="small">${esc((j.result_summary&&j.result_summary.tool_version)||"")}</td>
        <td class="flex"><button class="btn sm" data-act="job" data-job="${esc(j.id)}">↳</button>${["queued","leased","running"].includes(j.state)?`<button class="btn sm danger" data-act="jobstop" data-job="${esc(j.id)}">${esc(t("stop"))}</button>`:""}</td></tr>`).join("")||`<tr><td colspan=6 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>`);
  hydrateScanForm(a.assets);
}
function hydrateScanForm(){ /* connector list filtered by scope on submit */ }

async function scrFindings(ctx){
  const pid=S.project.id;
  const f=await api(`/api/projects/${pid}/findings`);
  setMain(ctx, topbar(t("findings"), `<button class="btn sm" data-act="refresh">↻ ${esc(t("refresh"))}</button>`)
    + h`<div class="card"><table><thead><tr><th>${esc(t("severity"))}</th><th>${esc(t("priority"))}</th><th>${esc(t("tool"))}</th><th>${esc(t("location"))}</th><th>${esc(t("verification"))}</th><th>${esc(t("status"))}</th><th>${esc(t("ftitle"))}</th></tr></thead>
      <tbody>${f.findings.map(x=>{const loc=x.location||{};const L=(loc.file||loc.url||loc.host||loc.package||"")+(loc.line?":"+loc.line:"");
        return `<tr data-act="finding" data-fid="${esc(x.id)}" style="cursor:pointer"><td><span class="badge sev-${esc(x.severity)}">${esc(x.severity)}</span></td>
        <td class="mono">${esc(x.work_priority)}</td><td class="small">${esc(x.connector)}</td><td class="mono-sm">${esc(L)}</td>
        <td class="small">${esc(x.verification_status)}</td><td class="small">${esc(x.status)}</td><td>${esc(x.title)}</td></tr>`;}).join("")||`<tr><td colspan=7 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>`);
}

async function scrAiLab(ctx){
  const ai=await api("/api/ai/status");
  setMain(ctx, topbar(t("ailab"), `<span class="pill ${ai.available?"ok":"warn"}">${esc(ai.available?ai.provider+" · "+ai.model:"fallback (no provider)")}</span>`)
    + h`<div class="card"><h2>${esc(t("evalset"))}</h2>
      <p class="small muted">Offline injection-resistance checks of the AI layer (sanitizer + structured-output contract). No external model.</p>
      <button class="btn primary" data-act="runeval">${esc(t("runeval"))}</button><div id="evalout"></div></div>
    ${S.project?`<div class="card"><h2>${esc(t("plan"))}</h2><button class="btn" data-act="aiplan">${esc(t("plan"))}</button><div id="planout"></div></div>`:""}
    <div class="card"><h2>ai_redteam</h2><p class="small muted">AI model red-team connector (prompt-injection / jailbreak / data-exfiltration probes with synthetic canaries). Requires a configured AI provider; otherwise shown as <b>blocked</b> in the catalog.</p></div>`);
}

async function scrReports(ctx){
  const pid=S.project.id;
  setMain(ctx, topbar(t("reports"))
    + h`<div class="card"><h2>${esc(t("genreport"))}</h2>
      <div class="flex">
        <button class="btn" data-act="report" data-format="html" data-lang="ar">HTML (ع)</button>
        <button class="btn" data-act="report" data-format="html" data-lang="en">HTML (EN)</button>
        <button class="btn" data-act="report" data-format="md" data-lang="ar">Markdown</button>
        <button class="btn" data-act="report" data-format="sarif" data-lang="en">SARIF</button>
        <button class="btn" data-act="report" data-format="json" data-lang="en">JSON</button>
      </div><p class="small" style="margin-top:8px">${esc(t("report_note"))}</p>
      <div id="reportout"></div>
      <button class="btn primary" data-act="aireport" style="margin-top:8px">AI executive summary</button><div id="repout"></div></div>`);
}

async function scrAudit(ctx){
  const pid=S.project?S.project.id:null;
  const a=await api("/api/audit"+(pid?`?project=${pid}`:""));
  setMain(ctx, topbar(t("audit"))
    + h`<div class="card"><table><thead><tr><th>time</th><th>actor</th><th>action</th><th>outcome</th><th>detail</th></tr></thead>
      <tbody>${a.audit.map(x=>`<tr><td class="small mono">${esc(x.created_at)}</td><td class="small">${esc(x.actor)}</td>
        <td class="small">${esc(x.action)}</td><td class="small state state-${x.outcome==="ok"?"ready":"blocked"}">${esc(x.outcome)}</td>
        <td class="mono-sm">${esc(JSON.stringify(x.detail))}</td></tr>`).join("")||`<tr><td colspan=5 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>`);
}

async function scrSettings(ctx){
  let stop={engaged:false}, users={users:[]};
  try{ stop=await api("/api/admin/stop"); }catch(e){}
  try{ users=await api("/api/users"); }catch(e){}
  const cfg=await api("/api/config");
  let me={}; try{ me=await api("/api/me"); }catch(e){}
  const cl=me.client;
  const notes=(me.setup_notices||[]).map(code=>
    notice((NOTICE_TEXT[S.lang][code]||code).replace(/\{min\}/g, cfg.min_password_length||10))).join("");
  setMain(ctx, topbar(t("settings"))
    + (notes?`<div class="card"><h2>${esc(t("setupnotes"))}</h2>${notes}</div>`:"")
    + (cl?`<div class="card"><h2>${esc(t("connection"))}</h2><div class="kv">
        <div class="k">${esc(t("yourip"))}</div><div class="mono-sm">${esc(cl.address||"—")}</div>
        <div class="k">${esc(t("ipsource"))}</div><div>${esc(t("src_"+cl.source))}</div></div>
        ${cl.proxy_headers_ignored?notice(t("proxywarn"),"err"):""}</div>`:"")
    + h`<div class="card"><h2>${esc(t("globalstop"))}</h2>
      <div class="flex"><span class="pill ${stop.engaged?"bad":"ok"}">${stop.engaged?esc(t("engaged")):esc(t("disengaged"))}</span>
      <button class="btn ${stop.engaged?"":"danger"}" data-act="togglestop" data-engaged="${stop.engaged?0:1}">${stop.engaged?"disengage":"ENGAGE STOP"}</button></div>
      <p class="small muted" style="margin-top:6px">Halts all leasing and signals running jobs to stop.</p></div>
    <div class="card"><h2>env</h2><div class="kv"><div class="k">environment</div><div>${esc(cfg.environment)}</div>
      <div class="k">ai</div><div>${cfg.ai_available?"available":"fallback"}</div></div></div>
    ${users.users.length?`<div class="card"><h2>${esc(t("users"))}</h2>
      <form id="userform" class="row"><div><label>${esc(t("email"))}</label><input name="email" type="email" required></div>
        <div><label>${esc(t("password"))}</label><input name="password" type="password" required></div>
        <div><label>${esc(t("role"))}</label><select name="global_role"><option>reader</option><option>analyst</option><option>admin</option><option>owner</option></select></div>
        <div><button class="btn primary">${esc(t("adduser"))}</button></div></form>
      <table style="margin-top:10px"><thead><tr><th>${esc(t("email"))}</th><th>${esc(t("role"))}</th><th>active</th></tr></thead>
      <tbody>${users.users.map(u=>`<tr><td class="small">${esc(u.email)}</td><td>${esc(u.global_role)}</td><td>${u.active?"✓":"✗"}</td></tr>`).join("")}</tbody></table></div>`:""}`);
}

// ---------- finding / job drawer ----------
async function openFinding(fid){
  const d=await api(`/api/findings/${fid}`); const f=d.finding; const loc=f.location||{};
  S.drawer = h`<div class="overlay" data-act="closedrawer"></div><div class="drawer">
    <div class="flex"><h2>${esc(f.title)}</h2><button class="btn sm right" data-act="closedrawer">${esc(t("close"))}</button></div>
    <span class="badge sev-${esc(f.severity)}">${esc(f.severity)}</span> <span class="pill">${esc(f.connector)}</span> <span class="pill">prio ${esc(f.work_priority)}</span>
    <div class="kv"><div class="k">rule</div><div class="mono-sm">${esc(f.rule_id)}</div>
      <div class="k">${esc(t("location"))}</div><div class="mono-sm">${esc(JSON.stringify(loc))}</div>
      <div class="k">cve/cwe</div><div>${esc(f.cve||"—")} / ${esc(f.cwe||"—")}</div>
      <div class="k">${esc(t("verification"))}</div><div>${esc(f.verification_status)}</div>
      <div class="k">${esc(t("status"))}</div><div>${esc(f.status)}</div>
      <div class="k">source</div><div>${esc(f.source_flag)} · occ ${esc(f.occurrences)}</div></div>
    <p class="small">${esc(f.description)}</p>
    <div class="flex">
      <button class="btn sm" data-act="ftriage" data-fid="${esc(fid)}">${esc(t("triage"))}</button>
      <button class="btn sm" data-act="fremediate" data-fid="${esc(fid)}">${esc(t("remediation"))}</button>
      <button class="btn sm" data-act="fvalidate" data-fid="${esc(fid)}">${esc(t("validate"))}</button>
    </div>
    <div class="flex" style="margin-top:8px">
      <button class="btn sm" data-act="fstatus" data-fid="${esc(fid)}" data-status="false_positive">false positive</button>
      <button class="btn sm" data-act="fstatus" data-fid="${esc(fid)}" data-status="risk_accepted">risk accepted</button>
      <button class="btn sm" data-act="fstatus" data-fid="${esc(fid)}" data-status="fixed_in_branch">fixed in branch</button>
    </div>
    <div id="aiout"></div>
    <h2 style="margin-top:18px">${esc(t("evidence"))}</h2>
    ${(d.evidence||[]).map(e=>`<div class="small mono-sm">${esc(e.kind)} · ${esc(String(e.sha256||"").slice(0,12))} · ${esc(e.bytes)}b <button class="btn sm" data-act="evread" data-eid="${esc(e.id)}">view</button></div>`).join("")||`<div class="muted small">${esc(t("none"))}</div>`}
    <div id="evout"></div></div>`;
  render();
}
async function openJob(jid){
  const d=await api(`/api/jobs/${jid}`); const j=d.job;
  S.drawer = h`<div class="overlay" data-act="closedrawer"></div><div class="drawer">
    <div class="flex"><h2>${esc(j.connector)} job</h2><button class="btn sm right" data-act="closedrawer">${esc(t("close"))}</button></div>
    <span class="state state-${esc(j.state)}">${esc(j.state)}</span>
    <div class="kv"><div class="k">phase</div><div>${esc(j.phase)}</div>
      <div class="k">attempts</div><div>${esc(j.attempts)}/${esc(j.max_attempts)}</div>
      <div class="k">created</div><div class="small">${esc(j.created_at)}</div>
      <div class="k">finished</div><div class="small">${esc(j.finished_at||"—")}</div>
      <div class="k">error</div><div class="mono-sm">${esc(JSON.stringify(j.error||"—"))}</div></div>
    <h2>result</h2><div class="ev">${esc(JSON.stringify(j.result_summary||{},null,2))}</div>
    <h2 style="margin-top:14px">${esc(t("evidence"))}</h2>
    ${(d.evidence||[]).map(e=>`<div class="small mono-sm">${esc(e.kind)} · ${esc(String(e.sha256||"").slice(0,12))} <button class="btn sm" data-act="evread" data-eid="${esc(e.id)}">view</button></div>`).join("")||`<div class="muted small">${esc(t("none"))}</div>`}
    <div id="evout"></div></div>`;
  render();
}

// ---------- events ----------
document.addEventListener("submit", async e=>{
  e.preventDefault(); const f=e.target; const fd=Object.fromEntries(new FormData(f).entries());
  // One request per form at a time: a double tap must not send a second one.
  if(f.dataset.busy) return;
  f.dataset.busy="1";
  const sendBtn=f.querySelector("button:not([type=button])"); if(sendBtn) sendBtn.disabled=true;
  try{
    if(f.id==="loginform"){ const r=await api("/api/auth/login","POST",{email:fd.email,password:fd.password});
      S.token=r.token; S.user=r.user; S.guest=false; S.loginOpen=false; S.project=null;
      localStorage.setItem("fsl_token",S.token); await boot(); return; }
    if(f.id==="assetform"){ const meta=fd.local_path?{local_path:fd.local_path}:{};
      await api(`/api/projects/${S.project.id}/assets`,"POST",{kind:fd.kind,identifier:fd.identifier,criticality:fd.criticality,metadata:meta});
      renderScreen(); return; }
    if(f.id==="scopeform"){ const types=[...f.querySelectorAll('input[name=st]:checked')].map(x=>x.value);
      await api(`/api/projects/${S.project.id}/scopes`,"POST",{asset_id:fd.asset_id,proof:fd.proof,environment:fd.environment,
        allowed_targets:fd.allowed_targets?fd.allowed_targets.split(",").map(s=>s.trim()):[],scan_types:types,owner_contact:fd.owner_contact});
      S.screen="assets"; renderScreen(); return; }
    if(f.id==="scanform"){ const sel=f.querySelector('[name=scope_id]').selectedOptions[0];
      await api(`/api/projects/${S.project.id}/scans`,"POST",{asset_id:sel.dataset.asset,scope_id:fd.scope_id,connector:fd.connector,
        idempotency_key:`${fd.scope_id}:${fd.connector}:${Date.now()}`}); renderScreen(); return; }
    if(f.id==="userform"){ await api("/api/users","POST",fd); renderScreen(); return; }
    if(f.id==="projform"){ const r=await api("/api/projects","POST",{name:fd.name}); S.projects.push(r.project); S.project=r.project; render(); return; }
  }catch(err){ const box=document.getElementById("loginmsg")||document.getElementById("main");
    let msg=err.message+(err.code?` [${err.code}]`:"");
    if(f.id==="loginform" && err.status===401){ msg = t("badlogin"); }
    if(f.id==="loginform" && err.status===429){
      const secs=(err.detail&&err.detail.retry_after_seconds)||600;
      // A short wait means the password check had no free turn; a long one
      // means too many wrong attempts from this device.
      msg = secs<=30 ? t("signinbusy") : t("throttled").replace("{m}", Math.max(1, Math.ceil(secs/60)));
    }
    if(box){ if(f.id==="loginform") box.innerHTML=""; box.insertAdjacentHTML("afterbegin", notice(msg,"err")); } }
  finally{ delete f.dataset.busy; if(sendBtn) sendBtn.disabled=false; }
});

document.addEventListener("change", async e=>{
  if(e.target.id==="projsel"){ const v=e.target.value;
    if(v==="__new"){ setMain(h`<div class="card"><h2>${esc(t("newproject"))}</h2>
      <form id="projform" class="row"><div style="flex:2"><label>${esc(t("name"))}</label><input name="name" required></div>
      <div><button class="btn primary">${esc(t("create"))}</button></div></form></div>`); return; }
    S.project=S.projects.find(p=>p.id===v); renderScreen(); }
});

document.addEventListener("click", async e=>{
  const b=e.target.closest("[data-act]"); if(!b) return;
  const act=b.dataset.act;
  try{
    if(act==="nav"){ S.screen=b.dataset.screen; S.drawer=null; render(); }
    else if(act==="lang"){ setLang(S.lang==="ar"?"en":"ar"); }
    else if(act==="logout"){ try{await api("/api/auth/logout","POST",{});}catch(_){}
      S.token=""; S.user=null; S.project=null; S.projects=[]; localStorage.removeItem("fsl_token"); await init(); }
    else if(act==="motion"){ toggleMotion(); }
    else if(act==="showlogin"){ S.loginOpen=true; S.drawer=null; render(); }
    else if(act==="backpublic"){ S.loginOpen=false; await init(); }
    else if(act==="reload"){ await init(); }
    else if(act==="report"){ await showReport(b.dataset.format, b.dataset.lang); }
    else if(act==="refresh"){ renderScreen(); }
    else if(act==="closedrawer"){ S.drawer=null; render(); }
    else if(act==="revoke"){ await api(`/api/scopes/${b.dataset.scope}/revoke`,"POST",{}); renderScreen(); }
    else if(act==="scopeform"){ showScopeForm(b.dataset.asset); }
    else if(act==="jobstop"){ await api(`/api/jobs/${b.dataset.job}/stop`,"POST",{}); renderScreen(); }
    else if(act==="job"){ await openJob(b.dataset.job); }
    else if(act==="finding"){ await openFinding(b.dataset.fid); }
    else if(act==="revoke"){ renderScreen(); }
    else if(act==="runeval"){ const r=await api("/api/ai/evalset");
      document.getElementById("evalout").innerHTML=`<div class="notice ${r.passed===r.total?"ok":"err"}">${esc(r.passed)}/${esc(r.total)} passed</div>`
        +`<table>${r.results.map(x=>`<tr><td>${x.pass?"✓":"✗"}</td><td class="small">${esc(x.id)}</td><td class="small muted">${esc(x.detail)}</td></tr>`).join("")}</table>`; }
    else if(act==="aiplan"){ const r=await api(`/api/projects/${S.project.id}/ai/plan`,"POST",{});
      const p=r.plan; document.getElementById("planout").innerHTML=`<div class="small muted">ai:${esc(p.ai_available)} fallback:${esc(p.fallback)}</div>`
        +`<table>${p.data.steps.map(s=>`<tr><td class="mono">${esc(s.connector)}</td><td class="mono-sm">${esc(s.asset_id)}</td><td class="small">${esc(s.rationale)}</td></tr>`).join("")}</table>`; }
    else if(act==="aireport"){ const r=await api(`/api/projects/${S.project.id}/ai/report`,"POST",{});
      const d=r.report.data; document.getElementById("repout").innerHTML=`<div class="notice">${esc(d.executive_summary_ar)}</div><div class="notice">${esc(d.executive_summary_en)}</div>`; }
    else if(act==="togglestop"){ await api("/api/admin/stop","POST",{engaged:b.dataset.engaged==="1"}); renderScreen(); }
    else if(act==="ftriage"){ const r=await api(`/api/findings/${b.dataset.fid}/triage`,"POST",{});
      aiBox(`triage (ai:${r.triage.ai_available})`, JSON.stringify(r.triage.data,null,2)); }
    else if(act==="fremediate"){ const r=await api(`/api/findings/${b.dataset.fid}/remediation`,"POST",{});
      aiBox(`remediation (ai:${r.remediation.ai_available})`, r.remediation.data.summary+"\n\n"+r.remediation.data.suggested_change+"\n\ntest: "+r.remediation.data.test_hint); }
    else if(act==="fvalidate"){ const r=await api(`/api/findings/${b.dataset.fid}/validate`,"POST",{});
      aiBox(`validation`, JSON.stringify(r.validation.data,null,2)); }
    else if(act==="fstatus"){ await api(`/api/findings/${b.dataset.fid}/status`,"POST",{status:b.dataset.status}); await openFinding(b.dataset.fid); }
    else if(act==="evread"){ const r=await api(`/api/evidence/${b.dataset.eid}`);
      const o=document.getElementById("evout"); if(o) o.innerHTML=`<div class="ev">${esc(r.text)}</div>`; }
  }catch(err){ const m=document.getElementById("main");
    if(m) m.insertAdjacentHTML("afterbegin", notice(err.message+(err.code?` [${err.code}]`:""),"err")); }
});

function aiBox(title,body){ const o=document.getElementById("aiout");
  if(o) o.innerHTML=`<h2 style="margin-top:14px">${esc(title)}</h2><div class="ev">${esc(body)}</div>`; }

function showScopeForm(assetId){
  const opts=document.getElementById("_connopts");
  const connOpts = opts?opts.innerHTML:"";
  document.getElementById("scopeformbox").innerHTML = h`<div class="card"><h2>${esc(t("addscope"))} — <span class="mono-sm">${esc(assetId)}</span></h2>
    <form id="scopeform"><input type="hidden" name="asset_id" value="${esc(assetId)}">
      <div class="row"><div><label>${esc(t("environment"))}</label><select name="environment"><option>lab</option><option>staging</option><option>prod</option></select></div>
        <div style="flex:2"><label>${esc(t("proof"))}</label><input name="proof" required placeholder="e.g. LAB-SELF-OWNED / ticket ref"></div>
        <div><label>${esc(t("owner_contact"))}</label><input name="owner_contact"></div></div>
      <label>${esc(t("allowed"))} (comma-separated)</label><input name="allowed_targets" placeholder="/path, https://host/path, owner/repo">
      <label>${esc(t("scantypes"))}</label><div class="flex">${connOpts}</div>
      <div style="margin-top:12px"><button class="btn primary">${esc(t("create"))}</button></div></form></div>`;
  document.getElementById("scopeformbox").scrollIntoView({behavior:"smooth"});
}

// The report is fetched with the session, then offered through a real link so a
// phone browser opens or saves it from a direct tap.
async function showReport(format, lang){
  const out = document.getElementById("reportout"); if (!out) return;
  const r = await apiRaw(`/api/projects/${S.project.id}/report?format=${encodeURIComponent(format)}&lang=${encodeURIComponent(lang)}`);
  const ext = {html:"html", md:"md", sarif:"sarif.json", json:"json"}[format] || "txt";
  const mime = format === "html" ? "text/html" : (format === "md" ? "text/markdown" : "application/json");
  const url = URL.createObjectURL(new Blob([r.text], { type: mime + ";charset=utf-8" }));
  const name = `faisal-security-lab-report.${ext}`;
  out.innerHTML = `<div class="flex" style="margin-block:10px">
      <a class="btn primary" href="${url}" target="_blank" rel="noopener">${esc(t("open"))}</a>
      <a class="btn" href="${url}" download="${name}">${esc(t("download"))} ${esc(name)}</a></div>`
    + (format === "html" ? "" : `<div class="ev">${esc(r.text.slice(0, 6000))}</div>`);
}

// ---------- boot ----------
async function boot(){
  try{
    const me=await api("/api/me"); S.user=me.user;
    const p=await api("/api/projects"); S.projects=p.projects||[];
    if(!S.project || !S.projects.find(x=>x.id===S.project.id)) S.project=S.projects[0]||null;
    render();
  }catch(e){
    if (e.status===401 || e.status===403){
      // The session is no longer valid (or the public view was switched off):
      // fall back to the public view when there is one, else to the sign-in form.
      const hadToken = !!S.token;
      S.token=""; S.user=null; localStorage.removeItem("fsl_token");
      if (hadToken && S.publicView){ S.guest=true; return boot(); }
      S.guest=false; return render();
    }
    // Busy or offline: keep the session and say so, with a way to try again.
    renderUnavailable();
  }
}
function renderUnavailable(){
  root().innerHTML = h`<div class="loginwrap"><div class="login">
    <div class="hero">${MASK("lg")}<h1 class="brand">FAISAL<span class="dot">.AI</span></h1></div>
    <div class="sub kicker">${esc(t("kicker"))}</div>
    ${notice(t("unavailable"), "err")}
    <div class="flex" style="margin-top:12px">
      <button class="btn primary" type="button" data-act="reload">↻ ${esc(t("retry"))}</button>
    </div></div></div>`;
  decorate();
}
async function init(){
  try{ const c=await api("/api/config"); S.publicView=!!c.public_view; }catch(e){ S.publicView=false; }
  if (S.token){ S.guest=false; return boot(); }
  if (S.publicView && !S.loginOpen){ S.guest=true; return boot(); }
  S.guest=false; render();
}
applyMotion();
document.documentElement.lang = S.lang;
document.documentElement.dir = S.lang==="ar"?"rtl":"ltr";
watchDom();
init();
