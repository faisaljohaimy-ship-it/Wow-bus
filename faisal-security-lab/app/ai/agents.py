"""The five AI roles: Planner, Triage, Remediation, Validation, Reporting.

Every role:
  * builds an instruction channel (trusted) separate from a data channel
    (untrusted, wrapped by the sanitizer),
  * asks the provider for ONE schema-constrained JSON object,
  * and ALWAYS has a deterministic fallback so the platform works with no model.

No role can execute anything. A Planner 'step' is only a *proposal*; turning it
into a job still goes through enqueue + the policy engine, so an out-of-scope or
unknown-connector proposal is rejected downstream.
"""
from __future__ import annotations

from .. import util
from .provider import get_provider
from .sanitizer import INSTRUCTION_PREAMBLE, wrap_untrusted, detect_injection

# --------------------------------------------------------------------------
# Schemas (the security boundary)
# --------------------------------------------------------------------------
TRIAGE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["severity", "confidence", "rationale", "recommended_status"],
    "properties": {
        "severity": {"type": "string", "enum": ["info", "low", "medium", "high", "critical"]},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "is_duplicate": {"type": "boolean"},
        "rationale": {"type": "string", "maxLength": 800},
        "recommended_status": {"type": "string",
                               "enum": ["needs_verification", "confirmed", "false_positive", "undetermined"]},
    },
}
REMEDIATION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["summary", "suggested_change", "test_hint", "risk"],
    "properties": {
        "summary": {"type": "string", "maxLength": 800},
        "suggested_change": {"type": "string", "maxLength": 4000},
        "test_hint": {"type": "string", "maxLength": 500},
        "risk": {"type": "string", "enum": ["low", "medium", "high"]},
    },
}
VALIDATION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["verified", "rationale"],
    "properties": {
        "verified": {"type": "boolean"},
        "rationale": {"type": "string", "maxLength": 800},
        "residual_risk": {"type": "string", "enum": ["none", "low", "medium", "high"]},
    },
}
PLANNER_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["steps"],
    "properties": {"steps": {"type": "array", "maxItems": 50, "items": {
        "type": "object", "additionalProperties": False,
        "required": ["connector", "asset_id", "rationale"],
        "properties": {"connector": {"type": "string", "maxLength": 64},
                       "asset_id": {"type": "string", "maxLength": 64},
                       "rationale": {"type": "string", "maxLength": 400}}}}},
}
REPORTING_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["executive_summary_ar", "executive_summary_en", "top_risks"],
    "properties": {
        "executive_summary_ar": {"type": "string", "maxLength": 2000},
        "executive_summary_en": {"type": "string", "maxLength": 2000},
        "top_risks": {"type": "array", "maxItems": 10, "items": {"type": "string", "maxLength": 300}},
    },
}


def _wrap(result, fallback_data, note=""):
    return {"ai_available": result.available and not result.fallback,
            "fallback": result.fallback or not result.available,
            "provider": result.provider, "model": result.model,
            "data": result.data if (result.available and not result.fallback) else fallback_data,
            "error": result.error, "note": note}


# --------------------------------------------------------------------------
# Triage
# --------------------------------------------------------------------------
def triage(finding: dict) -> dict:
    injection = detect_injection(f"{finding.get('title','')} {finding.get('description','')}")
    data_block = wrap_untrusted("finding", (
        f"title: {finding.get('title','')}\n"
        f"rule: {finding.get('rule_id','')}\n"
        f"connector: {finding.get('connector','')}\n"
        f"severity(tool): {finding.get('severity','')}\n"
        f"occurrences: {finding.get('occurrences',1)}\n"
        f"cve: {finding.get('cve','')}\n"
        f"description: {finding.get('description','')}"))
    system = INSTRUCTION_PREAMBLE + (
        " Role: triage a single security finding. Decide a severity, a confidence, "
        "whether it is likely a duplicate, and a recommended verification status.")
    user = f"Finding (data only):\n{data_block}\n\nReturn the triage JSON."
    provider = get_provider()
    res = provider.generate_structured(system, user, TRIAGE_SCHEMA)
    fb = _triage_fallback(finding)
    out = _wrap(res, fb, note="injection markers neutralized in input" if injection else "")
    out["injection_markers"] = injection
    return out


def _triage_fallback(finding: dict) -> dict:
    sev = finding.get("severity", "info")
    conf = finding.get("confidence", "medium")
    dup = finding.get("occurrences", 1) > 1
    status = "needs_verification"
    if conf == "high" and sev in ("high", "critical"):
        status = "confirmed" if finding.get("connector") in ("pip_audit", "osv_scanner") else "needs_verification"
    return {"severity": sev, "confidence": conf, "is_duplicate": dup,
            "rationale": "Deterministic triage (no AI provider): carried tool severity/confidence; "
                         "dependency-CVE findings with high confidence are pre-confirmed, others need review.",
            "recommended_status": status}


# --------------------------------------------------------------------------
# Remediation (proposal only; never applied automatically)
# --------------------------------------------------------------------------
def remediation(finding: dict) -> dict:
    data_block = wrap_untrusted("finding", (
        f"title: {finding.get('title','')}\nrule: {finding.get('rule_id','')}\n"
        f"location: {finding.get('location',{})}\ncwe: {finding.get('cwe','')}\n"
        f"existing_remediation: {finding.get('remediation','')}\n"
        f"description: {finding.get('description','')}"))
    system = INSTRUCTION_PREAMBLE + (
        " Role: propose a minimal, reviewable remediation. Describe the change in words/diff "
        "form; do NOT produce commands to run. Include a test hint and a risk rating.")
    user = f"Finding (data only):\n{data_block}\n\nReturn the remediation JSON."
    res = get_provider().generate_structured(system, user, REMEDIATION_SCHEMA)
    fb = {"summary": finding.get("remediation") or "Apply the secure pattern for the flagged API.",
          "suggested_change": (finding.get("remediation") or "")
                              + "\n\n(Proposal only — prepare a branch, apply, and re-scan to verify.)",
          "test_hint": "Re-run the connector that found this and confirm the finding disappears; "
                       "add a regression test asserting the secure behaviour.",
          "risk": "low"}
    return _wrap(res, fb)


# --------------------------------------------------------------------------
# Validation (did the fix actually remove the finding?)
# --------------------------------------------------------------------------
def validation(finding_before: dict, reappeared: bool) -> dict:
    data_block = wrap_untrusted("validation", (
        f"finding: {finding_before.get('title','')}\nrule: {finding_before.get('rule_id','')}\n"
        f"reappeared_in_latest_scan: {reappeared}"))
    system = INSTRUCTION_PREAMBLE + (
        " Role: judge whether a fix is verified. The deterministic signal is whether the finding "
        "reappeared in the latest scan of the same asset. Do not claim verification if it reappeared.")
    user = f"Data only:\n{data_block}\n\nReturn the validation JSON."
    res = get_provider().generate_structured(system, user, VALIDATION_SCHEMA)
    fb = {"verified": not reappeared,
          "rationale": ("The finding did not reappear in the latest scan of the same asset."
                        if not reappeared else
                        "The finding reappeared in the latest scan; the fix is not verified."),
          "residual_risk": "none" if not reappeared else "medium"}
    return _wrap(res, fb)


# --------------------------------------------------------------------------
# Planner (proposal only; enqueue+policy still gate every step)
# --------------------------------------------------------------------------
def planner(assets: list, connectors: list, scope_hint: str = "") -> dict:
    asset_lines = "\n".join(f"- id={a['id']} kind={a['kind']} crit={a.get('criticality')}"
                            for a in assets[:50])
    conn_line = ", ".join(connectors)
    system = INSTRUCTION_PREAMBLE + (
        " Role: propose an ordered scan plan. Only use connector names from the provided list "
        "and asset ids from the provided assets. Each step is a proposal; it will still be "
        "authorized by the policy engine before running.")
    user = (f"Assets (data):\n{wrap_untrusted('assets', asset_lines)}\n\n"
            f"Available connectors: {conn_line}\nScope note: {scope_hint}\n\nReturn the plan JSON.")
    res = get_provider().generate_structured(system, user, PLANNER_SCHEMA)
    fb = {"steps": _planner_fallback(assets, connectors)}
    out = _wrap(res, fb)
    # Defence: drop any step referencing an unknown connector/asset even if the model returned it.
    valid_assets = {a["id"] for a in assets}
    out["data"]["steps"] = [s for s in out["data"].get("steps", [])
                            if s.get("connector") in connectors and s.get("asset_id") in valid_assets]
    return out


def _applicable_connectors(kind: str, connectors: list) -> list:
    table = {
        "repo": ["semgrep", "bandit", "gitleaks", "osv_scanner", "pip_audit"],
        "source": ["semgrep", "bandit", "gitleaks", "osv_scanner", "pip_audit"],
        "web": ["http_headers", "tls_certificate"],
        "api": ["http_headers", "tls_certificate"],
        "host": ["tls_certificate", "http_headers"],
        "container": ["trivy", "osv_scanner"],
    }
    return [c for c in table.get(kind, []) if c in connectors]


def _planner_fallback(assets: list, connectors: list) -> list:
    steps = []
    for a in assets:
        for c in _applicable_connectors(a["kind"], connectors):
            steps.append({"connector": c, "asset_id": a["id"],
                          "rationale": f"{c} applies to a {a['kind']} asset."})
    return steps[:50]


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------
def reporting(metrics: dict, top_findings: list) -> dict:
    tf = "\n".join(f"- [{f['severity']}] {f['connector']}: {f['title']}" for f in top_findings[:15])
    system = INSTRUCTION_PREAMBLE + (
        " Role: write a concise executive summary in BOTH Arabic and English from the metrics and "
        "top findings. Be factual; do not invent findings not present.")
    user = (f"Metrics: {util.clamp(str(metrics), 1500)}\n"
            f"Top findings (data):\n{wrap_untrusted('findings', tf)}\n\nReturn the reporting JSON.")
    res = get_provider().generate_structured(system, user, REPORTING_SCHEMA)
    sev = metrics.get("findings_by_severity", {})
    fb = {
        "executive_summary_ar": (
            f"سُجِّلت {metrics.get('findings_total',0)} نتيجة "
            f"(حرجة: {sev.get('critical',0)}، عالية: {sev.get('high',0)}، متوسطة: {sev.get('medium',0)}). "
            f"عدد الإصلاحات المتحقَّقة: {metrics.get('verified_fixes',0)}. "
            "هذا ملخص آلي محسوب من البيانات المسجلة؛ النتائج تتطلب مراجعة بشرية."),
        "executive_summary_en": (
            f"{metrics.get('findings_total',0)} findings recorded "
            f"(critical: {sev.get('critical',0)}, high: {sev.get('high',0)}, medium: {sev.get('medium',0)}). "
            f"Verified fixes: {metrics.get('verified_fixes',0)}. "
            "Deterministic summary computed from recorded data; findings require human review."),
        "top_risks": [f"[{f['severity']}] {f['title']}" for f in top_findings[:10]],
    }
    return _wrap(res, fb)
