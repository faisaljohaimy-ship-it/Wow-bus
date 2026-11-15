"""Red / Blue / Discovery team model.

The platform's work is organised into three teams so an operator can read it the
way security teams actually divide the job:

  * discovery  — reconnaissance and vulnerability finding (the scanners)
  * red        — offensive analysis of what was found: how a weakness could be
                 abused, attack paths, and weak-crypto / cipher analysis
  * blue       — defensive response: fixes, hardening and detection

A fourth, "purple", is not a team but the combined view an operation produces:
each red attack path paired with the blue defence that closes it.

This module is pure data and classification. It gives NO team the power to act;
every scan a team maps to still runs only inside an authorization scope, through
the policy engine, exactly as before. The teams are a lens over the same gated
pipeline, not a way around it.
"""
from __future__ import annotations

# Which connectors belong to which team. Discovery owns the scanners; red owns
# the offensive-analysis connectors. Blue owns no scanner — it works from the
# findings the others produce (its output is remediation and detection).
_CONNECTOR_TEAM = {
    # discovery: recon + vulnerability finding
    "http_headers": "discovery",
    "tls_certificate": "discovery",
    "semgrep": "discovery",
    "bandit": "discovery",
    "gitleaks": "discovery",
    "pip_audit": "discovery",
    "osv_scanner": "discovery",
    "trivy": "discovery",
    # red: offensive analysis
    "ai_redteam": "red",
    "crypto_analysis": "red",
}

TEAMS = {
    "discovery": {
        "key": "discovery",
        "name_en": "Discovery", "name_ar": "فريق الاكتشاف",
        "tagline_en": "Reconnaissance and vulnerability finding",
        "tagline_ar": "الاستطلاع واكتشاف الثغرات",
        "accent": "#38bdf8",
        "role": "Runs the real scanners inside the authorized scope and reports "
                "what exists: exposed surfaces, weak configuration, known-vulnerable "
                "dependencies, secrets and insecure code.",
    },
    "red": {
        "key": "red",
        "name_en": "Red Team", "name_ar": "فريق الهجوم",
        "tagline_en": "How a weakness could be abused",
        "tagline_ar": "كيف يمكن استغلال الثغرة",
        "accent": "#ef4444",
        "role": "Thinks like an attacker over the evidence the Discovery team "
                "gathered: the attack path for each finding, how findings chain, "
                "and analysis of weak or home-made cryptography. Analysis only — it "
                "launches nothing outside the scope and nothing outside the lab.",
    },
    "blue": {
        "key": "blue",
        "name_en": "Blue Team", "name_ar": "فريق الدفاع",
        "tagline_en": "Fix, harden and detect",
        "tagline_ar": "الإصلاح والتحصين والكشف",
        "accent": "#22c55e",
        "role": "Turns each finding into a defence: the concrete fix, a hardening "
                "step, and a detection idea so the same move is caught next time.",
    },
}

TEAM_ORDER = ["discovery", "red", "blue"]


def team_for_connector(connector_name: str) -> str:
    """The team a connector belongs to. Unknown connectors count as discovery
    (a new scanner is reconnaissance until classified otherwise)."""
    return _CONNECTOR_TEAM.get(connector_name, "discovery")


def connectors_for_team(team: str) -> list[str]:
    return sorted(c for c, t in _CONNECTOR_TEAM.items() if t == team)


def summarize_by_team(findings: list[dict]) -> dict:
    """Group a list of finding dicts (each with a 'connector' and 'severity')
    under the team that produced them, with a severity tally per team."""
    out = {t: {"count": 0, "by_severity": {}} for t in TEAM_ORDER}
    for f in findings:
        team = team_for_connector(f.get("connector", ""))
        bucket = out[team]
        bucket["count"] += 1
        sev = f.get("severity", "info")
        bucket["by_severity"][sev] = bucket["by_severity"].get(sev, 0) + 1
    return out


def team_meta() -> list[dict]:
    """The three teams in display order, for the API and UI."""
    return [TEAMS[k] for k in TEAM_ORDER]
