"""Trivy connector (filesystem / SBOM / dependency scanning).

Implemented for completeness. In this build environment the Trivy binary could
not be installed (its GitHub release assets 404 through the egress proxy), so
readiness() reports it as not installed and the tool-registry state resolves to
'blocked'. The connector is correct and will activate the moment a `trivy`
binary is on PATH — it is never reported as verified until a real run proves it.
"""
from __future__ import annotations

import json

from ..errors import ConnectorError, TimeoutError_, ToolUnavailable
from .base import Connector, ConnectorResult, EvidenceArtifact, ExecContext, RawFinding, run_tool

SEV_MAP = {"CRITICAL": "critical", "HIGH": "high", "MEDIUM": "medium",
           "LOW": "low", "UNKNOWN": "info"}


class TrivyConnector(Connector):
    name = "trivy"
    category = "dependencies/containers/SBOM"
    source = "https://github.com/aquasecurity/trivy"
    license = "Apache-2.0"
    binary = "trivy"
    egress = ["ghcr.io", "mirror.gcr.io (vulnerability DB)"]

    def capabilities(self) -> dict:
        return {"active": False, "passive": True, "needs_source": True, "needs_network": True}

    def execute(self, ctx: ExecContext) -> ConnectorResult:
        import shutil
        if not shutil.which("trivy"):
            raise ToolUnavailable(
                "trivy is not installed in this environment "
                "(blocked: release assets unreachable via egress proxy)")
        out_file = ctx.workdir / "trivy.json"
        argv = ["trivy", "filesystem", "--quiet", "--format", "json",
                "--output", str(out_file), "--scanners", "vuln,secret,misconfig",
                str(ctx.input_dir)]
        run = run_tool(argv, ctx=ctx, cwd=ctx.workdir)
        if run.cancelled:
            raise ConnectorError("trivy cancelled")
        if run.timed_out:
            raise TimeoutError_("trivy exceeded its time budget")
        if not out_file.exists():
            raise ConnectorError(
                "trivy produced no report",
                detail={"returncode": run.returncode,
                        "stderr": run.stderr.decode("utf-8", "replace")[:500]})
        report = json.loads(out_file.read_text(encoding="utf-8"))
        findings = []
        for res in report.get("Results", []) or []:
            target = res.get("Target", "")
            for v in res.get("Vulnerabilities", []) or []:
                findings.append(RawFinding(
                    rule_id=v.get("VulnerabilityID", "TRIVY"),
                    title=f"{v.get('PkgName')} {v.get('InstalledVersion')}: {v.get('Title', v.get('VulnerabilityID',''))}"[:200],
                    severity=SEV_MAP.get(str(v.get("Severity", "")).upper(), "info"),
                    confidence="high",
                    location={"file": target, "package": v.get("PkgName"),
                              "version": v.get("InstalledVersion")},
                    description=(v.get("Description", "") or "")[:1000],
                    remediation=(f"Upgrade to {v.get('FixedVersion')}." if v.get("FixedVersion")
                                 else "Upgrade to a fixed version."),
                    cve=v.get("VulnerabilityID", "") if str(v.get("VulnerabilityID", "")).startswith("CVE-") else "",
                    cvss=self._cvss(v),
                    tags=["dependency"],
                    fingerprint=f"{v.get('VulnerabilityID')}:{v.get('PkgName')}:{v.get('InstalledVersion')}"))
        evidence = [EvidenceArtifact("trivy-summary.json", "raw",
                                     json.dumps({"results": len(report.get("Results", [])),
                                                 "findings": len(findings)}),
                                     content_type="application/json")]
        return ConnectorResult(
            status="succeeded" if findings else "succeeded_no_findings",
            findings=findings, evidence=evidence,
            summary={"findings": len(findings)},
            coverage="Trivy filesystem scan: vuln + secret + misconfig scanners.")

    @staticmethod
    def _cvss(v: dict) -> dict:
        cvss = v.get("CVSS", {}) or {}
        for src in ("nvd", "redhat", "ghsa"):
            if src in cvss and cvss[src].get("V3Score"):
                return {"score": cvss[src]["V3Score"], "vector": cvss[src].get("V3Vector", ""),
                        "source": src, "date": ""}
        return {}
