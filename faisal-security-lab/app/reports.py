"""Report generation: JSON, SARIF 2.1.0 (for code findings), and bilingual
(Arabic/English) Markdown + HTML. All content is redacted on the way out."""
from __future__ import annotations

import csv
import html
import io
import json

from . import conflicts as conflicts_mod
from . import findings as findings_mod
from . import metrics as metrics_mod
from . import queue as queue_mod
from . import store, util
from .connectors import connector_names
from .version import __version__

# Absence of findings is never a safety guarantee (§10).
_SAFETY_NOTE = {
    "ar": "غياب النتائج لا يعني أن الأصل آمن؛ النتائج تبيّن فقط ما غطّته الأدوات المتاحة ضمن النطاق "
          "وتاريخ قواعدها. ما لم يُفحص يبقى غير معروف.",
    "en": "Absence of findings is NOT a guarantee of safety; results reflect only what the available "
          "tools covered within scope and the date of their rule data. What was not scanned is unknown.",
}

SEV_ORDER = ["critical", "high", "medium", "low", "info"]

_T = {
    "ar": {
        "title": "تقرير الأمن الدفاعي", "project": "المشروع", "generated": "تاريخ الإصدار",
        "summary": "ملخص تنفيذي", "findings": "النتائج", "severity": "الشدة",
        "status": "الحالة", "tool": "الأداة", "location": "الموقع", "priority": "الأولوية",
        "verification": "التحقق", "remediation": "التوصية", "no_findings": "لا توجد نتائج مسجلة.",
        "counts": "التوزيع حسب الشدة", "verified_fixes": "إصلاحات متحقَّقة",
        "note": "الأدلة منقّحة. القيم الحساسة محجوبة. النتائج تتطلب مراجعة بشرية.",
    },
    "en": {
        "title": "Defensive Security Report", "project": "Project", "generated": "Generated",
        "summary": "Executive summary", "findings": "Findings", "severity": "Severity",
        "status": "Status", "tool": "Tool", "location": "Location", "priority": "Priority",
        "verification": "Verification", "remediation": "Remediation",
        "no_findings": "No findings recorded.", "counts": "By severity",
        "verified_fixes": "Verified fixes",
        "note": "Evidence is redacted. Sensitive values are withheld. Findings require human review.",
    },
}


# The hooded-mask mark and the code strips of the console, for the HTML report.
# Plain markup and CSS: the report runs no script.
_MASK_OUTLINE = "M40 3C24 4 10 20 5 48l10 23 25 14 25-14 10-23C70 20 56 4 40 3Z"
_CODE_LINES = (
    "scope.check(target); verify(owner); audit.record(event); policy.allow(job);",
    "findings.dedup(key); priority = severity * criticality; report.build(lang);",
    "semgrep.scan(src); gitleaks.detect(src); bandit.audit(src); pip_audit.check(deps);",
    "queue.lease(job, ttl=120); worker.run(connector, sandbox); evidence.redact(raw);",
)


def _mask_svg(size: str = "") -> str:
    o = _MASK_OUTLINE
    return (
        f'<svg class="mask {size}" viewBox="-8 -8 96 104" aria-hidden="true" focusable="false">'
        f'<path class="laser two" d="{o}" transform="translate(40 44) scale(1.16) translate(-40 -44)"'
        ' fill="none" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="9 41" pathLength="100"/>'
        f'<path d="{o}" fill="#130a0e" stroke="#bd203e" stroke-width="1.7"/>'
        '<path d="M40 14 18 38l4 25 18 15 18-15 4-25Z" fill="#e9e1e4" stroke="#8f263e" stroke-width="1.4"/>'
        '<path d="m21 38 12 4-4 6-9-5m39-5-12 4 4 6 9-5" fill="#10080b"/>'
        '<path d="m23 33 11 5m23-5-11 5" fill="none" stroke="#971f3b" stroke-width="3" stroke-linecap="round"/>'
        '<path d="m39 41-4 15 5 3 5-3-4-15m-12 20 11 5 11-5m-16 9 5 3 5-3" fill="none" stroke="#561728"'
        ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
        '<path d="m24 42 5 2m22 0 5-2" stroke="#f22b50" stroke-width="2" stroke-linecap="round"/>'
        f'<path class="laser" d="{o}" fill="none" stroke-width="2.4" stroke-linecap="round"'
        ' stroke-dasharray="18 82" pathLength="100"/></svg>')


def _card_head(i: int) -> str:
    """The strip at the top of a report card: the mask and a line of moving code."""
    half = (_CODE_LINES[i % len(_CODE_LINES)] + "    ") * 5
    rev = " rev" if i % 2 else ""
    return (f'<div class="cardhead" aria-hidden="true">{_mask_svg("sm")}'
            f'<div class="codebar{rev}"><span>{html.escape(half + half)}</span></div></div>')


def _coverage(project_id: str) -> dict:
    """What was and was not scanned — so a report never implies more coverage
    than it has. Connectors that ran, assets reached, and the tools available
    but not run."""
    jobs = queue_mod.list_jobs(project_id, limit=5000)
    ran: dict[str, dict] = {}
    assets = set()
    for j in jobs:
        c = j["connector"]
        r = ran.setdefault(c, {"connector": c, "runs": 0, "succeeded": 0, "last_at": ""})
        r["runs"] += 1
        if j["state"] == "succeeded":
            r["succeeded"] += 1
        fin = j.get("finished_at") or ""
        if fin > r["last_at"]:
            r["last_at"] = fin
        assets.add(j["asset_id"])
    available = set(connector_names())
    return {
        "connectors_run": sorted(ran.values(), key=lambda x: x["connector"]),
        "connectors_available_not_run": sorted(available - set(ran)),
        "assets_scanned": len(assets),
        "total_assets": len(store.list_assets(project_id)),
        "jobs_total": len(jobs),
    }


def build_report(project_id: str) -> dict:
    project = store.get_project(project_id)
    fnds = findings_mod.list_findings(project_id, limit=5000)
    m = metrics_mod.snapshot(project_id)
    return {
        "platform": "Faisal Security Lab", "platform_version": __version__,
        "generated_at": util.now_iso(),
        "project": {"id": project["id"], "name": project["name"]},
        "metrics": m,
        "coverage": _coverage(project_id),
        "conflicts_open": conflicts_mod.open_count(project_id),
        "safety_note": _SAFETY_NOTE,
        "findings": [_loc(f) for f in fnds],
    }


def _csv_cell(value) -> str:
    """A CSV cell that cannot be read as a spreadsheet formula."""
    s = "" if value is None else str(value)
    if s and s[0] in "=+-@\t\r":
        s = "'" + s
    return s


def to_csv(project_id: str) -> str:
    """Findings as CSV (UTF-8 with BOM so spreadsheets read Arabic correctly).
    Values are redacted and formula-guarded; csv handles comma/quote escaping."""
    r = build_report(project_id)
    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)
    w.writerow(["id", "severity", "work_priority", "connector", "tool_version", "rule_id",
                "status", "verification_status", "location", "cve", "cwe", "title"])
    for f in r["findings"]:
        loc = f["location"]
        locs = loc.get("file") or loc.get("url") or loc.get("host") or loc.get("package") or ""
        if loc.get("line"):
            locs += f":{loc['line']}"
        w.writerow([_csv_cell(x) for x in (
            f["id"], f["severity"], f["work_priority"], f["connector"], f.get("tool_version", ""),
            f["rule_id"], f["status"], f["verification_status"], locs, f.get("cve", ""),
            f.get("cwe", ""), f["title"])])
    return buf.getvalue()


def _loc(f: dict) -> dict:
    loc = f.get("location")
    if isinstance(loc, str):
        try:
            loc = json.loads(loc)
        except (ValueError, TypeError):
            loc = {}
    return {
        "id": f["id"], "connector": f["connector"], "tool_version": f.get("tool_version", ""),
        "rule_id": f["rule_id"], "title": util.redact(f["title"]),
        "severity": f["severity"], "confidence": f["confidence"],
        "verification_status": f["verification_status"], "status": f["status"],
        "work_priority": f["work_priority"], "location": loc,
        "cve": f.get("cve", ""), "cwe": f.get("cwe", ""),
        "remediation": util.redact(f.get("remediation", "")),
        "description": util.redact(f.get("description", "")),
        "source_flag": f.get("source_flag", "real"),
        "occurrences": f.get("occurrences", 1), "reopened": f.get("reopened", 0),
    }


def to_json(project_id: str) -> str:
    return json.dumps(build_report(project_id), ensure_ascii=False, indent=2)


def to_sarif(project_id: str) -> str:
    """SARIF 2.1.0 for findings that carry a file location (code findings)."""
    report = build_report(project_id)
    by_tool: dict[str, list] = {}
    for f in report["findings"]:
        loc = f["location"]
        if not loc.get("file"):
            continue
        by_tool.setdefault(f["connector"], []).append(f)
    runs = []
    sev_level = {"critical": "error", "high": "error", "medium": "warning",
                 "low": "note", "info": "note"}
    for tool, items in by_tool.items():
        rules, results = {}, []
        for f in items:
            rid = f["rule_id"] or "finding"
            rules.setdefault(rid, {"id": rid, "shortDescription": {"text": f["title"][:120]},
                                   "properties": {"cwe": f["cwe"]}})
            results.append({
                "ruleId": rid, "level": sev_level.get(f["severity"], "note"),
                "message": {"text": f["title"]},
                "locations": [{"physicalLocation": {
                    "artifactLocation": {"uri": loc.get("file", "")},
                    "region": {"startLine": loc.get("line") or 1}}}],
                "properties": {"severity": f["severity"], "workPriority": f["work_priority"],
                               "verification": f["verification_status"]},
            })
        runs.append({"tool": {"driver": {"name": tool, "informationUri": "",
                                         "version": items[0].get("tool_version", ""),
                                         "rules": list(rules.values())}},
                     "results": results})
    sarif = {"version": "2.1.0",
             "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
             "runs": runs or [{"tool": {"driver": {"name": "faisal-security-lab",
                                                    "rules": []}}, "results": []}]}
    return json.dumps(sarif, ensure_ascii=False, indent=2)


def to_markdown(project_id: str, lang: str = "ar") -> str:
    t = _T.get(lang, _T["ar"])
    r = build_report(project_id)
    lines = [f"# {t['title']}", "",
             f"**{t['project']}:** {r['project']['name']}  ",
             f"**{t['generated']}:** {r['generated_at']}  ",
             f"**Platform:** Faisal Security Lab v{r['platform_version']}", "",
             f"> {t['note']}", "",
             f"## {t['summary']}", ""]
    sev = r["metrics"].get("findings_by_severity", {})
    lines.append(f"**{t['counts']}:** " +
                 ", ".join(f"{s}={sev.get(s,0)}" for s in SEV_ORDER))
    lines.append(f"**{t['verified_fixes']}:** {r['metrics'].get('verified_fixes',0)}")
    # Coverage + the "no findings != safe" statement (§10).
    cov = r.get("coverage", {})
    ran = ", ".join(f"{c['connector']}({c['succeeded']}/{c['runs']})"
                    for c in cov.get("connectors_run", [])) or "—"
    cov_label = "التغطية" if lang == "ar" else "Coverage"
    tools_lbl = "أدوات شُغّلت" if lang == "ar" else "tools run"
    assets_lbl = "أصول" if lang == "ar" else "assets"
    conf_lbl = "تعارضات مفتوحة" if lang == "ar" else "open conflicts"
    lines.append(f"**{cov_label}:** {tools_lbl}: {ran}; {assets_lbl}: "
                 f"{cov.get('assets_scanned',0)}/{cov.get('total_assets',0)}; "
                 f"{conf_lbl}: {r.get('conflicts_open',0)}")
    not_run = cov.get("connectors_available_not_run", [])
    if not_run:
        nr_lbl = "أدوات متاحة لم تُشغّل" if lang == "ar" else "available, not run"
        lines.append(f"**{nr_lbl}:** " + ", ".join(not_run))
    lines.append(f"> ⚠ {_SAFETY_NOTE.get(lang, _SAFETY_NOTE['en'])}")
    lines += ["", f"## {t['findings']}", ""]
    if not r["findings"]:
        lines.append(t["no_findings"])
    else:
        lines.append(f"| {t['severity']} | {t['priority']} | {t['tool']} | {t['location']} "
                     f"| {t['verification']} | {t['status']} | Title |")
        lines.append("|---|---|---|---|---|---|---|")
        order = {s: i for i, s in enumerate(SEV_ORDER)}
        for f in sorted(r["findings"], key=lambda x: (order.get(x["severity"], 9),
                                                      -x["work_priority"])):
            loc = f["location"]
            locs = loc.get("file") or loc.get("url") or loc.get("host") or loc.get("package") or ""
            if loc.get("line"):
                locs += f":{loc['line']}"
            lines.append(f"| {f['severity']} | {f['work_priority']} | {f['connector']} | "
                         f"`{locs}` | {f['verification_status']} | {f['status']} | "
                         f"{f['title'].replace('|','/')} |")
    return "\n".join(lines)


def to_html(project_id: str, lang: str = "ar") -> str:
    # The language reaches the markup (<html lang>), so only known codes are used.
    lang = lang if lang in _T else "ar"
    t = _T[lang]
    r = build_report(project_id)
    direction = "rtl" if lang == "ar" else "ltr"
    sev = r["metrics"].get("findings_by_severity", {})
    rows = []
    order = {s: i for i, s in enumerate(SEV_ORDER)}
    for f in sorted(r["findings"], key=lambda x: (order.get(x["severity"], 9), -x["work_priority"])):
        loc = f["location"]
        locs = loc.get("file") or loc.get("url") or loc.get("host") or loc.get("package") or ""
        if loc.get("line"):
            locs += f":{loc['line']}"
        rows.append(
            f"<tr><td><span class='sev sev-{html.escape(f['severity'])}'>"
            f"{html.escape(f['severity'])}</span></td><td>{html.escape(str(f['work_priority']))}</td>"
            f"<td>{html.escape(f['connector'])}</td><td><code>{html.escape(locs)}</code></td>"
            f"<td>{html.escape(f['verification_status'])}</td><td>{html.escape(f['status'])}</td>"
            f"<td>{html.escape(f['title'])}</td></tr>")
    counts = " · ".join(f"{s}: <b>{html.escape(str(sev.get(s, 0)))}</b>" for s in SEV_ORDER)
    body_rows = "".join(rows) or f"<tr><td colspan=7>{html.escape(t['no_findings'])}</td></tr>"
    cov = r.get("coverage", {})
    ran = ", ".join(f"{html.escape(c['connector'])} ({c['succeeded']}/{c['runs']})"
                    for c in cov.get("connectors_run", [])) or "—"
    cov_label = "التغطية" if lang == "ar" else "Coverage"
    assets_lbl = "أصول" if lang == "ar" else "assets"
    conf_lbl = "تعارضات مفتوحة" if lang == "ar" else "open conflicts"
    cov_line = (f"{html.escape(cov_label)}: {ran} · {html.escape(assets_lbl)} "
                f"{cov.get('assets_scanned', 0)}/{cov.get('total_assets', 0)} · "
                f"{html.escape(conf_lbl)}: {r.get('conflicts_open', 0)}")
    safety = html.escape(_SAFETY_NOTE.get(lang, _SAFETY_NOTE["en"]))
    return f"""<!doctype html><html lang="{lang}" dir="{direction}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(t['title'])} — {html.escape(r['project']['name'])}</title>
<style>
:root{{color-scheme:dark}}
body{{font-family:Tahoma,'Segoe UI',Arial,sans-serif;background:#000;color:#ff6875;margin:0;padding:20px;line-height:1.6;overflow-wrap:anywhere}}
h1{{color:#ff6875;font-size:22px}} .dot{{color:#fff}}
.card{{background:#f04b57;color:#080808;border:2px solid #ff6875;border-radius:14px;padding:14px 18px;margin:16px 0;overflow-x:auto}}
.card *{{color:#080808}}
h2{{font-size:17px;margin:0 0 10px}}
table{{width:100%;border-collapse:collapse;font-size:14px}}
th,td{{border-bottom:1px solid #33000f66;padding:8px 9px;text-align:start;vertical-align:top}}
th{{font-weight:700}}
code{{font-family:ui-monospace,Consolas,monospace;font-size:12.5px}}
.sev{{padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;border:2px solid #080808;white-space:nowrap}}
.card .sev-critical{{background:#080808;color:#ff6875}}
.card .sev-high{{background:#33000f;color:#ffd3d7}}
.sev-low{{border-style:dashed}} .sev-info{{border-style:dotted}}
.note{{font-size:13px}}
h1{{display:flex;align-items:center;gap:12px;flex-wrap:wrap}}
.mask{{flex:0 0 auto;width:46px;height:50px}} .mask.sm{{width:22px;height:24px}}
.mask .laser{{stroke:#ff2d4d;animation:laser-orbit 1.4s linear infinite}}
.mask .laser.two{{animation-duration:2.3s;animation-direction:reverse;opacity:.75}}
.card .mask .laser{{stroke:#080808}}
@keyframes laser-orbit{{to{{stroke-dashoffset:-100}}}}
.cardhead{{display:flex;align-items:center;gap:8px;margin:0 -18px 12px;padding:6px 12px;
  border-bottom:1px solid #33000f66;overflow:hidden}}
.codebar{{direction:ltr;flex:1;min-width:0;overflow:hidden;white-space:nowrap;
  font-family:ui-monospace,Consolas,monospace;font-size:11px;opacity:.85}}
.codebar>span{{display:inline-block;padding-inline-end:24px;animation:code-flow 38s linear infinite}}
.codebar.rev>span{{animation-direction:reverse}}
@keyframes code-flow{{to{{transform:translateX(-50%)}}}}
@media (prefers-reduced-motion:reduce){{.mask .laser,.codebar>span{{animation-play-state:paused}}}}
@media print{{.mask .laser,.codebar>span{{animation:none}}}}
</style></head><body>
<h1>{_mask_svg()}<span>FAISAL<span class="dot">.AI</span> — {html.escape(t['title'])}</span></h1>
<div class="card">{_card_head(0)}<b>{html.escape(t['project'])}:</b> {html.escape(r['project']['name'])}<br>
<b>{html.escape(t['generated'])}:</b> {html.escape(r['generated_at'])}<br>
<span class="note">Faisal Security Lab v{html.escape(r['platform_version'])} — {html.escape(t['note'])}</span></div>
<div class="card">{_card_head(1)}<b>{html.escape(t['counts'])}:</b> {counts}<br>
<b>{html.escape(t['verified_fixes'])}:</b> {html.escape(str(r['metrics'].get('verified_fixes', 0)))}<br>
{cov_line}<br><span class="note">⚠ {safety}</span></div>
<div class="card">{_card_head(2)}<h2>{html.escape(t['findings'])}</h2>
<table><thead><tr><th>{html.escape(t['severity'])}</th><th>{html.escape(t['priority'])}</th>
<th>{html.escape(t['tool'])}</th><th>{html.escape(t['location'])}</th>
<th>{html.escape(t['verification'])}</th><th>{html.escape(t['status'])}</th><th>Title</th></tr></thead>
<tbody>{body_rows}</tbody></table></div>
</body></html>"""
