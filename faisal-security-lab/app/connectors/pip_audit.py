"""pip-audit connector — audits Python requirement files against advisory DBs.

Operates on requirement/lock files found in staged source. Requires egress to
the advisory database; a blocked egress is reported as failed, not clean.
"""
from __future__ import annotations

import json
from pathlib import Path

from ..errors import ConnectorError, TimeoutError_
from .base import Connector, ConnectorResult, EvidenceArtifact, ExecContext, RawFinding, run_tool

REQ_NAMES = ("requirements.txt", "requirements.in", "requirements-dev.txt")


class PipAuditConnector(Connector):
    name = "pip_audit"
    category = "dependencies"
    source = "https://github.com/pypa/pip-audit"
    license = "Apache-2.0"
    binary = "pip-audit"
    egress = ["pypi.org", "api.osv.dev"]

    def capabilities(self) -> dict:
        return {"active": False, "passive": True, "needs_source": True, "needs_network": True}

    def _find_requirements(self, root: Path) -> list[Path]:
        found = []
        for name in REQ_NAMES:
            found.extend(root.rglob(name))
        return found[:20]

    def execute(self, ctx: ExecContext) -> ConnectorResult:
        reqs = self._find_requirements(ctx.input_dir)
        if not reqs:
            return ConnectorResult(
                status="unsupported", findings=[],
                summary={"reason": "no requirements files found"},
                coverage="No Python requirement files present; nothing to audit.")
        argv = ["pip-audit", "--format", "json", "--progress-spinner", "off"]
        for r in reqs:
            argv += ["-r", str(r)]
        run = run_tool(argv, ctx=ctx, cwd=ctx.workdir)
        if run.cancelled:
            raise ConnectorError("pip-audit cancelled")
        if run.timed_out:
            raise TimeoutError_("pip-audit exceeded its time budget")
        stdout = run.stdout.decode("utf-8", "replace").strip()
        stderr = run.stderr.decode("utf-8", "replace")
        if not stdout:
            raise ConnectorError(
                "pip-audit returned no JSON (advisory DB egress may be blocked)",
                detail={"returncode": run.returncode, "stderr": stderr[:500]})
        try:
            report = json.loads(stdout)
        except ValueError as e:
            raise ConnectorError(f"pip-audit output invalid JSON: {e}",
                                 detail={"stderr": stderr[:300]})

        deps = report.get("dependencies", report) if isinstance(report, dict) else report
        findings = []
        for dep in deps:
            name = dep.get("name")
            version = dep.get("version")
            for v in dep.get("vulns", []) or []:
                aliases = v.get("aliases", []) or []
                cve = next((a for a in aliases if a.startswith("CVE-")), v.get("id", ""))
                fixes = v.get("fix_versions", []) or []
                findings.append(RawFinding(
                    rule_id=v.get("id", "PYSEC"),
                    title=f"{name} {version}: {v.get('id','vulnerability')}"[:200],
                    severity="high" if fixes else "medium", confidence="high",
                    location={"package": name, "version": version},
                    description=(v.get("description", "") or "")[:1000],
                    remediation=(f"Upgrade {name} to {', '.join(fixes[:3])}." if fixes
                                 else f"Upgrade {name} to a non-vulnerable version."),
                    cve=cve if cve.startswith("CVE-") else "",
                    tags=["dependency", "python"],
                    fingerprint=f"{v.get('id')}:{name}:{version}"))
        evidence = [EvidenceArtifact(
            name="pip-audit.json", kind="raw",
            text=json.dumps({"deps": len(deps), "vulns": len(findings),
                             "requirements": [str(r.relative_to(ctx.input_dir)) for r in reqs]},
                            ensure_ascii=False), content_type="application/json")]
        return ConnectorResult(
            status="succeeded" if findings else "succeeded_no_findings",
            findings=findings, evidence=evidence,
            summary={"dependencies": len(deps), "vulns": len(findings)},
            coverage=f"Audited {len(reqs)} requirement file(s) against the Python advisory DB.")
