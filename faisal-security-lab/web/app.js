/* FAISAL.AI defensive console — vanilla SPA, CSP-safe (event delegation). */
"use strict";
const S = { token: localStorage.getItem("fsl_token") || "", user: null,
  lang: localStorage.getItem("fsl_lang") || "ar", projects: [], project: null,
  screen: "dashboard", connectors: [], drawer: null };

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
    criticality:"الأهمية", unauthorized:"غير مصرح — راجع النطاق.", refresh:"تحديث" },
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
    unauthorized:"Not authorized — check scope.", refresh:"Refresh" }
};
const t = k => (I18N[S.lang][k] || k);

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
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const h = (strings,...v)=>strings.map((s,i)=>s+(v[i]!=null?v[i]:"")).join("");

// ---- shell / render ----
const root = () => document.getElementById("root");
function setLang(l){ S.lang=l; localStorage.setItem("fsl_lang",l);
  document.documentElement.lang=l; document.documentElement.dir = l==="ar"?"rtl":"ltr"; render(); }

const LOGO = `<svg viewBox="0 0 80 88" aria-hidden="true"><path d="M40 4 72 18v26c0 22-16 34-32 40C24 78 8 66 8 44V18Z" fill="none" stroke="#fa3a5d" stroke-width="5"/><path d="M28 44l9 9 16-18" fill="none" stroke="#ff496a" stroke-width="5" stroke-linecap="round"/></svg>`;

function render(){
  if (!S.token){ return renderLogin(); }
  document.documentElement.dir = S.lang==="ar"?"rtl":"ltr";
  document.documentElement.lang = S.lang;
  const nav = [["dashboard","◆"],["assets","▣"],["catalog","☷"],["scans","▶"],
    ["findings","⚑"],["ailab","✦"],["reports","▤"],["audit","☰"],["settings","⚙"]];
  root().innerHTML = h`
    <div class="app">
      <aside class="sidebar">
        <div class="logo-row">${LOGO}<div><div class="brand" style="font-size:18px">FAISAL<span class="dot">.AI</span></div>
          <div class="kicker">${esc(t("kicker"))}</div></div></div>
        <div class="small muted">${esc(t("project"))}:</div>
        <select id="projsel">${S.projects.map(p=>`<option value="${p.id}" ${S.project&&S.project.id===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}
          <option value="__new">+ ${esc(t("newproject"))}</option></select>
        <nav class="nav">${nav.map(([k,ic])=>`<button data-act="nav" data-screen="${k}" class="${S.screen===k?"active":""}">${ic} ${esc(t(k))}</button>`).join("")}</nav>
        <div class="sec"></div>
        <button class="btn sm" data-act="lang">🌐 ${esc(t("lang"))}</button>
        <button class="btn sm" data-act="logout">⎋ ${esc(t("signout"))}</button>
        <div class="small muted" style="margin-top:12px">${esc(S.user?S.user.email:"")}<br>${esc(S.user?S.user.global_role:"")}</div>
      </aside>
      <main class="main" id="main"><div class="notice">…</div></main>
    </div>${S.drawer||""}`;
  renderScreen();
}

function renderLogin(){
  root().innerHTML = h`<div class="login">
    <div class="logo-row">${LOGO}<h1 class="brand">FAISAL<span class="dot">.AI</span></h1></div>
    <div class="sub kicker">${esc(t("kicker"))}</div>
    <div id="loginmsg"></div>
    <form id="loginform">
      <label>${esc(t("email"))}</label><input type="email" name="email" required>
      <label>${esc(t("password"))}</label><input type="password" name="password" required>
      <div style="margin-top:16px" class="flex">
        <button class="btn primary" type="submit">${esc(t("signin"))}</button>
        <button class="btn sm right" type="button" data-act="lang">🌐 ${esc(t("lang"))}</button>
      </div>
    </form></div>`;
}

function setMain(html){ const m=document.getElementById("main"); if(m) m.innerHTML=html; }
function notice(msg,cls=""){ return `<div class="notice ${cls}">${esc(msg)}</div>`; }

// ---------- screens ----------
async function renderScreen(){
  try{
    if (S.screen==="dashboard") return await scrDashboard();
    if (!S.project && ["assets","scans","findings","reports"].includes(S.screen))
      return setMain(notice(t("noproject")));
    if (S.screen==="assets") return await scrAssets();
    if (S.screen==="catalog") return await scrCatalog();
    if (S.screen==="scans") return await scrScans();
    if (S.screen==="findings") return await scrFindings();
    if (S.screen==="ailab") return await scrAiLab();
    if (S.screen==="reports") return await scrReports();
    if (S.screen==="audit") return await scrAudit();
    if (S.screen==="settings") return await scrSettings();
  }catch(e){ setMain(notice(e.message + (e.code?` [${e.code}]`:""), "err")); }
}
function topbar(title, extra=""){ return h`<div class="topbar"><h1>${esc(title)}</h1><div class="spacer"></div>${extra}</div>`; }

async function scrDashboard(){
  const pid = S.project?S.project.id:null;
  const m = await api("/api/metrics"+(pid?`?project=${pid}`:""));
  const ai = await api("/api/ai/status");
  const sev = m.findings_by_severity||{};
  const ts = m.tool_states||{};
  setMain(topbar(t("dashboard"),
      `<span class="pill ${ai.available?"ok":"warn"}">AI: ${ai.available?ai.model||"on":"fallback"}</span>
       <button class="btn sm" data-act="refresh">↻ ${esc(t("refresh"))}</button>`)
    + h`<div class="grid cols-4">
      <div class="stat"><div class="n">${m.findings_total||0}</div><div class="l">${esc(t("findings_total"))}</div></div>
      <div class="stat"><div class="n">${m.verified_fixes||0}</div><div class="l">${esc(t("verified_fixes"))}</div></div>
      <div class="stat"><div class="n">${m.assets||0}</div><div class="l">${esc(t("assets"))}</div></div>
      <div class="stat"><div class="n">${m.scopes_active||0}</div><div class="l">${esc(t("activescopes"))}</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card"><h2>${esc(t("severity"))}</h2>${sevBars(sev)}</div>
      <div class="card"><h2>${esc(t("jobs"))}</h2>${kvTable(m.jobs_by_state||{})}</div>
    </div>
    <div class="card"><h2>${esc(t("toolstate"))}</h2>${kvTable(ts)}
      <div class="small muted" style="margin-top:8px">catalog: ${JSON.stringify(m.catalog_states||{})}</div></div>`);
}
function sevBars(sev){ const order=["critical","high","medium","low","info"];
  const max=Math.max(1,...order.map(s=>sev[s]||0));
  return order.map(s=>`<div style="margin:6px 0"><div class="flex small"><span class="badge sev-${s}">${s}</span>
    <span class="right mono">${sev[s]||0}</span></div>
    <div class="progress"><span style="width:${(sev[s]||0)/max*100}%"></span></div></div>`).join("");
}
function kvTable(obj){ const k=Object.keys(obj); if(!k.length) return `<div class="muted small">${esc(t("none"))}</div>`;
  return `<table>${k.map(x=>`<tr><td>${esc(x)}</td><td class="mono right"><span class="state state-${esc(x)}">${obj[x]}</span></td></tr>`).join("")}</table>`; }

async function scrAssets(){
  const pid=S.project.id;
  const [a,sc,conn] = await Promise.all([api(`/api/projects/${pid}/assets`),
    api(`/api/projects/${pid}/scopes`), api(`/api/connectors`)]);
  S.connectors = conn.connectors;
  const connOpts = conn.connectors.map(c=>`<label class="small"><input type="checkbox" name="st" value="${c.name}"> ${c.name}</label>`).join(" ");
  setMain(topbar(t("assets"))
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
        <td><button class="btn sm" data-act="scopeform" data-asset="${x.id}">+ ${esc(t("addscope"))}</button></td></tr>`).join("")||`<tr><td colspan=4 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>
    <div id="scopeformbox"></div>
    <div class="card"><h2>${esc(t("scope"))}</h2><table><thead><tr><th>${esc(t("asset"))}</th><th>${esc(t("environment"))}</th><th>${esc(t("scantypes"))}</th><th>${esc(t("status"))}</th><th></th></tr></thead>
      <tbody>${sc.scopes.map(x=>`<tr><td class="mono-sm">${esc(x.asset_id)}</td><td>${esc(x.environment)}</td>
        <td class="small">${(x.scan_types||[]).join(", ")}</td><td class="state state-${x.status==="active"?"ready":"blocked"}">${esc(x.status)}</td>
        <td>${x.status==="active"?`<button class="btn sm danger" data-act="revoke" data-scope="${x.id}">${esc(t("revoke"))}</button>`:""}</td></tr>`).join("")||`<tr><td colspan=5 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>
    <div id="_connopts" class="hidden">${connOpts}</div>`);
}

async function scrCatalog(){
  const [cat,tools]=await Promise.all([api("/api/catalog"),api("/api/tools")]);
  const trMap={}; tools.tools.forEach(x=>trMap[x.name]=x);
  setMain(topbar(t("catalog"), `<span class="pill">${cat.tools.length} tools · ${cat.categories.length} categories</span>`)
    + h`<div class="card"><h2>${esc(t("connector"))} / ${esc(t("toolstate"))}</h2>
      <table><thead><tr><th>${esc(t("tool"))}</th><th>category</th><th>version</th><th>state</th><th>source</th></tr></thead>
      <tbody>${tools.tools.map(x=>`<tr><td class="mono">${esc(x.name)}</td><td class="small">${esc(x.category)}</td>
        <td class="small">${esc(x.version||"—")}</td><td class="state state-${esc(x.state)}">${esc(x.state)}</td>
        <td class="small"><a href="${esc(x.source)}" target="_blank" rel="noopener">${esc((x.source||"").replace("https://github.com/",""))}</a></td></tr>`).join("")}</tbody></table>
      <div class="small muted" style="margin-top:8px">states: catalog→installed→ready→verified; blocked/stale/disabled are distinct.</div></div>
    ${cat.categories.map(c=>`<div class="card"><h2>${esc(c.category)} <span class="muted small">(${c.n})</span></h2>
      <table>${cat.tools.filter(x=>x.category===c.category).map(x=>`<tr>
        <td class="mono-sm"><a href="https://github.com/${esc(x.repo)}" target="_blank" rel="noopener">${esc(x.repo)}</a></td>
        <td class="small">${esc(x.description)}</td>
        <td>${x.integration_state==="connector_available"?'<span class="pill ok">connector</span>':'<span class="pill">cataloged</span>'}${x.archived?' <span class="pill warn">archived</span>':""}</td></tr>`).join("")}</table></div>`).join("")}`);
}

async function scrScans(){
  const pid=S.project.id;
  const [a,sc,conn,jobs]=await Promise.all([api(`/api/projects/${pid}/assets`),
    api(`/api/projects/${pid}/scopes`),api(`/api/connectors`),api(`/api/projects/${pid}/jobs`)]);
  const activeScopes=sc.scopes.filter(s=>s.status==="active");
  setMain(topbar(t("scans"), `<button class="btn sm" data-act="refresh">↻ ${esc(t("refresh"))}</button>`)
    + h`<div class="card"><h2>${esc(t("run"))}</h2>
      <form id="scanform" class="row">
        <div><label>${esc(t("scope"))}</label><select name="scope_id">${activeScopes.map(s=>`<option value="${s.id}" data-asset="${s.asset_id}" data-types='${JSON.stringify(s.scan_types)}'>${esc(s.asset_id)} · ${esc(s.environment)}</option>`).join("")}</select></div>
        <div><label>${esc(t("connector"))}</label><select name="connector" id="connsel">${conn.connectors.map(c=>`<option value="${c.name}">${c.name} ${c.readiness.available?"":"(blocked)"}</option>`).join("")}</select></div>
        <div><button class="btn primary">${esc(t("run"))}</button></div>
      </form><div class="small muted" style="margin-top:6px">${esc(t("unauthorized"))}</div></div>
    <div class="card"><h2>${esc(t("jobs"))}</h2><table><thead><tr><th>${esc(t("connector"))}</th><th>${esc(t("status"))}</th><th>phase</th><th>progress</th><th>${esc(t("tool"))}</th><th></th></tr></thead>
      <tbody>${jobs.jobs.map(j=>`<tr><td class="mono">${esc(j.connector)}</td><td class="state state-${esc(j.state)}">${esc(j.state)}</td>
        <td class="small">${esc(j.phase)}</td><td style="width:120px"><div class="progress"><span style="width:${Math.round((j.progress||0)*100)}%"></span></div></td>
        <td class="small">${esc((j.result_summary&&j.result_summary.tool_version)||"")}</td>
        <td class="flex"><button class="btn sm" data-act="job" data-job="${j.id}">↳</button>${["queued","leased","running"].includes(j.state)?`<button class="btn sm danger" data-act="jobstop" data-job="${j.id}">${esc(t("stop"))}</button>`:""}</td></tr>`).join("")||`<tr><td colspan=6 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>`);
  hydrateScanForm(a.assets);
}
function hydrateScanForm(){ /* connector list filtered by scope on submit */ }

async function scrFindings(){
  const pid=S.project.id;
  const f=await api(`/api/projects/${pid}/findings`);
  setMain(topbar(t("findings"), `<button class="btn sm" data-act="refresh">↻ ${esc(t("refresh"))}</button>`)
    + h`<div class="card"><table><thead><tr><th>${esc(t("severity"))}</th><th>${esc(t("priority"))}</th><th>${esc(t("tool"))}</th><th>${esc(t("location"))}</th><th>${esc(t("verification"))}</th><th>${esc(t("status"))}</th><th>Title</th></tr></thead>
      <tbody>${f.findings.map(x=>{const loc=x.location||{};const L=(loc.file||loc.url||loc.host||loc.package||"")+(loc.line?":"+loc.line:"");
        return `<tr data-act="finding" data-fid="${x.id}" style="cursor:pointer"><td><span class="badge sev-${x.severity}">${x.severity}</span></td>
        <td class="mono">${x.work_priority}</td><td class="small">${esc(x.connector)}</td><td class="mono-sm">${esc(L)}</td>
        <td class="small">${esc(x.verification_status)}</td><td class="small">${esc(x.status)}</td><td>${esc(x.title)}</td></tr>`;}).join("")||`<tr><td colspan=7 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>`);
}

async function scrAiLab(){
  const ai=await api("/api/ai/status");
  setMain(topbar(t("ailab"), `<span class="pill ${ai.available?"ok":"warn"}">${ai.available?ai.provider+" · "+ai.model:"fallback (no provider)"}</span>`)
    + h`<div class="card"><h2>${esc(t("evalset"))}</h2>
      <p class="small muted">Offline injection-resistance checks of the AI layer (sanitizer + structured-output contract). No external model.</p>
      <button class="btn primary" data-act="runeval">${esc(t("runeval"))}</button><div id="evalout"></div></div>
    ${S.project?`<div class="card"><h2>${esc(t("plan"))}</h2><button class="btn" data-act="aiplan">${esc(t("plan"))}</button><div id="planout"></div></div>`:""}
    <div class="card"><h2>ai_redteam</h2><p class="small muted">AI model red-team connector (prompt-injection / jailbreak / data-exfiltration probes with synthetic canaries). Requires a configured AI provider; otherwise shown as <b>blocked</b> in the catalog.</p></div>`);
}

async function scrReports(){
  const pid=S.project.id;
  setMain(topbar(t("reports"))
    + h`<div class="card"><h2>${esc(t("genreport"))}</h2>
      <div class="flex">
        <a class="btn" href="/api/projects/${pid}/report?format=html&lang=ar" target="_blank">HTML (ع)</a>
        <a class="btn" href="/api/projects/${pid}/report?format=html&lang=en" target="_blank">HTML (EN)</a>
        <a class="btn" href="/api/projects/${pid}/report?format=md&lang=ar" target="_blank">Markdown</a>
        <a class="btn" href="/api/projects/${pid}/report?format=sarif" target="_blank">SARIF</a>
        <a class="btn" href="/api/projects/${pid}/report?format=json" target="_blank">JSON</a>
      </div><p class="small muted" style="margin-top:8px">Reports are redacted. Links open with your session in a new tab.</p>
      <button class="btn primary" data-act="aireport" style="margin-top:8px">AI executive summary</button><div id="repout"></div></div>`);
}

async function scrAudit(){
  const pid=S.project?S.project.id:null;
  const a=await api("/api/audit"+(pid?`?project=${pid}`:""));
  setMain(topbar(t("audit"))
    + h`<div class="card"><table><thead><tr><th>time</th><th>actor</th><th>action</th><th>outcome</th><th>detail</th></tr></thead>
      <tbody>${a.audit.map(x=>`<tr><td class="small mono">${esc(x.created_at)}</td><td class="small">${esc(x.actor)}</td>
        <td class="small">${esc(x.action)}</td><td class="small state state-${x.outcome==="ok"?"ready":"blocked"}">${esc(x.outcome)}</td>
        <td class="mono-sm">${esc(JSON.stringify(x.detail))}</td></tr>`).join("")||`<tr><td colspan=5 class="muted">${esc(t("none"))}</td></tr>`}</tbody></table></div>`);
}

async function scrSettings(){
  let stop={engaged:false}, users={users:[]};
  try{ stop=await api("/api/admin/stop"); }catch(e){}
  try{ users=await api("/api/users"); }catch(e){}
  const cfg=await api("/api/config");
  setMain(topbar(t("settings"))
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
    <span class="badge sev-${f.severity}">${f.severity}</span> <span class="pill">${esc(f.connector)}</span> <span class="pill">prio ${f.work_priority}</span>
    <div class="kv"><div class="k">rule</div><div class="mono-sm">${esc(f.rule_id)}</div>
      <div class="k">${esc(t("location"))}</div><div class="mono-sm">${esc(JSON.stringify(loc))}</div>
      <div class="k">cve/cwe</div><div>${esc(f.cve||"—")} / ${esc(f.cwe||"—")}</div>
      <div class="k">${esc(t("verification"))}</div><div>${esc(f.verification_status)}</div>
      <div class="k">${esc(t("status"))}</div><div>${esc(f.status)}</div>
      <div class="k">source</div><div>${esc(f.source_flag)} · occ ${f.occurrences}</div></div>
    <p class="small">${esc(f.description)}</p>
    <div class="flex">
      <button class="btn sm" data-act="ftriage" data-fid="${fid}">${esc(t("triage"))}</button>
      <button class="btn sm" data-act="fremediate" data-fid="${fid}">${esc(t("remediation"))}</button>
      <button class="btn sm" data-act="fvalidate" data-fid="${fid}">${esc(t("validate"))}</button>
    </div>
    <div class="flex" style="margin-top:8px">
      <button class="btn sm" data-act="fstatus" data-fid="${fid}" data-status="false_positive">false positive</button>
      <button class="btn sm" data-act="fstatus" data-fid="${fid}" data-status="risk_accepted">risk accepted</button>
      <button class="btn sm" data-act="fstatus" data-fid="${fid}" data-status="fixed_in_branch">fixed in branch</button>
    </div>
    <div id="aiout"></div>
    <h2 style="margin-top:18px">${esc(t("evidence"))}</h2>
    ${(d.evidence||[]).map(e=>`<div class="small mono-sm">${esc(e.kind)} · ${esc(e.sha256.slice(0,12))} · ${e.bytes}b <button class="btn sm" data-act="evread" data-eid="${e.id}">view</button></div>`).join("")||`<div class="muted small">${esc(t("none"))}</div>`}
    <div id="evout"></div></div>`;
  render();
}
async function openJob(jid){
  const d=await api(`/api/jobs/${jid}`); const j=d.job;
  S.drawer = h`<div class="overlay" data-act="closedrawer"></div><div class="drawer">
    <div class="flex"><h2>${esc(j.connector)} job</h2><button class="btn sm right" data-act="closedrawer">${esc(t("close"))}</button></div>
    <span class="state state-${esc(j.state)}">${esc(j.state)}</span>
    <div class="kv"><div class="k">phase</div><div>${esc(j.phase)}</div>
      <div class="k">attempts</div><div>${j.attempts}/${j.max_attempts}</div>
      <div class="k">created</div><div class="small">${esc(j.created_at)}</div>
      <div class="k">finished</div><div class="small">${esc(j.finished_at||"—")}</div>
      <div class="k">error</div><div class="mono-sm">${esc(JSON.stringify(j.error||"—"))}</div></div>
    <h2>result</h2><div class="ev">${esc(JSON.stringify(j.result_summary||{},null,2))}</div>
    <h2 style="margin-top:14px">${esc(t("evidence"))}</h2>
    ${(d.evidence||[]).map(e=>`<div class="small mono-sm">${esc(e.kind)} · ${esc(e.sha256.slice(0,12))} <button class="btn sm" data-act="evread" data-eid="${e.id}">view</button></div>`).join("")||`<div class="muted small">${esc(t("none"))}</div>`}
    <div id="evout"></div></div>`;
  render();
}

// ---------- events ----------
document.addEventListener("submit", async e=>{
  e.preventDefault(); const f=e.target; const fd=Object.fromEntries(new FormData(f).entries());
  try{
    if(f.id==="loginform"){ const r=await api("/api/auth/login","POST",{email:fd.email,password:fd.password});
      S.token=r.token; S.user=r.user; localStorage.setItem("fsl_token",S.token); await boot(); return; }
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
    if(box) box.insertAdjacentHTML("afterbegin", notice(err.message+(err.code?` [${err.code}]`:""),"err")); }
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
      S.token=""; S.user=null; localStorage.removeItem("fsl_token"); render(); }
    else if(act==="refresh"){ renderScreen(); }
    else if(act==="closedrawer"){ S.drawer=null; render(); }
    else if(act==="revoke"){ await api(`/api/scopes/${b.dataset.scope}/revoke`,"POST",{}); renderScreen(); }
    else if(act==="scopeform"){ showScopeForm(b.dataset.asset); }
    else if(act==="jobstop"){ await api(`/api/jobs/${b.dataset.job}/stop`,"POST",{}); renderScreen(); }
    else if(act==="job"){ await openJob(b.dataset.job); }
    else if(act==="finding"){ await openFinding(b.dataset.fid); }
    else if(act==="revoke"){ renderScreen(); }
    else if(act==="runeval"){ const r=await api("/api/ai/evalset");
      document.getElementById("evalout").innerHTML=`<div class="notice ${r.passed===r.total?"ok":"err"}">${r.passed}/${r.total} passed</div>`
        +`<table>${r.results.map(x=>`<tr><td>${x.pass?"✓":"✗"}</td><td class="small">${esc(x.id)}</td><td class="small muted">${esc(x.detail)}</td></tr>`).join("")}</table>`; }
    else if(act==="aiplan"){ const r=await api(`/api/projects/${S.project.id}/ai/plan`,"POST",{});
      const p=r.plan; document.getElementById("planout").innerHTML=`<div class="small muted">ai:${p.ai_available} fallback:${p.fallback}</div>`
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

// ---------- boot ----------
async function boot(){
  try{
    const me=await api("/api/me"); S.user=me.user;
    const p=await api("/api/projects"); S.projects=p.projects||[];
    if(!S.project && S.projects.length) S.project=S.projects[0];
    render();
  }catch(e){ S.token=""; localStorage.removeItem("fsl_token"); render(); }
}
setLang(S.lang);
if(S.token) boot(); else render();
