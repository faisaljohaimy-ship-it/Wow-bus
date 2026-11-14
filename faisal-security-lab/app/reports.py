"""Report generation: JSON, SARIF 2.1.0 (for code findings), and bilingual
(Arabic/English) Markdown + HTML. All content is redacted on the way out."""
from __future__ import annotations

import html
import json

from . import findings as findings_mod
from . import metrics as metrics_mod
from . import store, util
from .version import __version__

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


def build_report(project_id: str) -> dict:
    project = store.get_project(project_id)
    fnds = findings_mod.list_findings(project_id, limit=5000)
    m = metrics_mod.snapshot(project_id)
    return {
        "platform": "Faisal Security Lab", "platform_version": __version__,
        "generated_at": util.now_iso(),
        "project": {"id": project["id"], "name": project["name"]},
        "metrics": m,
        "findings": [_loc(f) for f in fnds],
    }


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
    t = _T.get(lang, _T["ar"])
    r = build_report(project_id)
    direction = "rtl" if lang == "ar" else "ltr"
    sev = r["metrics"].get("findings_by_severity", {})
    sev_colors = {"critical": "#b3123b", "high": "#d82445", "medium": "#dfb27d",
                  "low": "#6b8", "info": "#789"}
    rows = []
    order = {s: i for i, s in enumerate(SEV_ORDER)}
    for f in sorted(r["findings"], key=lambda x: (order.get(x["severity"], 9), -x["work_priority"])):
        loc = f["location"]
        locs = loc.get("file") or loc.get("url") or loc.get("host") or loc.get("package") or ""
        if loc.get("line"):
            locs += f":{loc['line']}"
        rows.append(
            f"<tr><td><span class='sev' style='background:{sev_colors.get(f['severity'],'#789')}'>"
            f"{html.escape(f['severity'])}</span></td><td>{f['work_priority']}</td>"
            f"<td>{html.escape(f['connector'])}</td><td><code>{html.escape(locs)}</code></td>"
            f"<td>{html.escape(f['verification_status'])}</td><td>{html.escape(f['status'])}</td>"
            f"<td>{html.escape(f['title'])}</td></tr>")
    counts = " · ".join(f"{s}: <b>{sev.get(s,0)}</b>" for s in SEV_ORDER)
    body_rows = "".join(rows) or f"<tr><td colspan=7>{html.escape(t['no_findings'])}</td></tr>"
    return f"""<!doctype html><html lang="{lang}" dir="{direction}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(t['title'])} — {html.escape(r['project']['name'])}</title>
<style>
:root{{color-scheme:dark}}
body{{font-family:Tahoma,'Segoe UI',Arial,sans-serif;background:#070608;color:#f4f0f2;margin:0;padding:24px;line-height:1.6}}
h1{{color:#ff496a}} .dot{{color:#fa3a5d}}
.card{{background:#130a0f;border:1px solid #48212e;border-radius:12px;padding:16px 20px;margin:16px 0}}
table{{width:100%;border-collapse:collapse;font-size:14px}}
th,td{{border-bottom:1px solid #48212e;padding:8px 10px;text-align:start}}
th{{color:#baa5ad;font-weight:600}}
code{{font-family:ui-monospace,Consolas,monospace;color:#dfb27d}}
.sev{{color:#fff5f8;padding:2px 8px;border-radius:999px;font-size:12px}}
.note{{color:#baa5ad;font-size:13px}}
</style></head><body>
<h1>FAISAL<span class="dot">.AI</span> — {html.escape(t['title'])}</h1>
<div class="card"><b>{html.escape(t['project'])}:</b> {html.escape(r['project']['name'])}<br>
<b>{html.escape(t['generated'])}:</b> {html.escape(r['generated_at'])}<br>
<span class="note">Faisal Security Lab v{html.escape(r['platform_version'])} — {html.escape(t['note'])}</span></div>
<div class="card"><b>{html.escape(t['counts'])}:</b> {counts}<br>
<b>{html.escape(t['verified_fixes'])}:</b> {r['metrics'].get('verified_fixes',0)}</div>
<div class="card"><h2>{html.escape(t['findings'])}</h2>
<table><thead><tr><th>{html.escape(t['severity'])}</th><th>{html.escape(t['priority'])}</th>
<th>{html.escape(t['tool'])}</th><th>{html.escape(t['location'])}</th>
<th>{html.escape(t['verification'])}</th><th>{html.escape(t['status'])}</th><th>Title</th></tr></thead>
<tbody>{body_rows}</tbody></table></div>
</body></html>"""
