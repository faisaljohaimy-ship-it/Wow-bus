"""OSV-Scanner dependency-vulnerability connector.

Scans staged source for lockfiles/manifests and queries the OSV database for
known-vulnerable dependency versions. Requires egress to the OSV API; if that
egress is blocked the run is reported as failed with a specific reason (never a
false "clean").
"""
from __future__ import annotations

import json

from ..errors import ConnectorError, TimeoutError_
from .base import Connector, ConnectorResult, EvidenceArtifact, ExecContext, RawFinding, run_tool

OSV_SEV = {"CRITICAL": "critical", "HIGH": "high", "MODERATE": "medium",
           "MEDIUM": "medium", "LOW": "low"}


class OsvScannerConnector(Connector):
    name = "osv_scanner"
    category = "dependencies"
    source = "https://github.com/google/osv-scanner"
    license = "Apache-2.0"
    binary = "osv-scanner"
    egress = ["api.osv.dev"]

    def capabilities(self) -> dict:
        return {"active": False, "passive": True, "needs_source": True, "needs_network": True}

    def execute(self, ctx: ExecContext) -> ConnectorResult:
        argv = ["osv-scanner", "--format", "json", "--recursive", str(ctx.input_dir)]
        run = run_tool(argv, ctx=ctx, cwd=ctx.workdir)
        if run.cancelled:
            raise ConnectorError("osv-scanner cancelled")
        if run.timed_out:
            raise TimeoutError_("osv-scanner exceeded its time budget")
        stdout = run.stdout.decode("utf-8", "replace").strip()
        stderr = run.stderr.decode("utf-8", "replace")

        # Exit codes: 0 = no vulns, 1 = vulns found. Others = error (often no
        # lockfiles found, or network blocked).
        if not stdout:
            if "no lockfiles" in stderr.lower() or "no package sources" in stderr.lower():
                return ConnectorResult(
                    status="unsupported", findings=[],
                    evidence=[EvidenceArtifact("osv-stderr.txt", "tool-meta", stderr[:2000])],
                    summary={"reason": "no dependency manifests found in source"},
                    coverage="No lockfiles/manifests present; nothing to audit.")
            raise ConnectorError(
                "osv-scanner did not return JSON (dependency DB egress may be blocked)",
                detail={"returncode": run.returncode, "stderr": stderr[:500]})
        try:
            report = json.loads(stdout)
        except ValueError as e:
            raise ConnectorError(f"osv-scanner output invalid JSON: {e}",
                                 detail={"stderr": stderr[:300]})

        findings = []
        pkgs = 0
        for res in report.get("results", []):
            source_path = (res.get("source", {}) or {}).get("path", "")
            for pkg in res.get("packages", []):
                pkgs += 1
                p = pkg.get("package", {})
                for v in pkg.get("vulnerabilities", []):
                    aliases = v.get("aliases", []) or []
                    cve = next((a for a in aliases if a.startswith("CVE-")), "")
                    sev = self._severity(v)
                    findings.append(RawFinding(
                        rule_id=v.get("id", "OSV"),
                        title=f"{p.get('name')} {p.get('version')}: {v.get('summary', v.get('id',''))}"[:200],
                        severity=sev, confidence="high",
                        location={"file": source_path, "package": p.get("name"),
                                  "version": p.get("version"), "ecosystem": p.get("ecosystem")},
                        description=(v.get("summary") or v.get("details", ""))[:1000],
                        remediation=self._fix_hint(v, p),
                        cve=cve,
                        cwe=self._cwe(v),
                        tags=["dependency", p.get("ecosystem", "")],
                        fingerprint=f"{v.get('id')}:{p.get('name')}:{p.get('version')}"))
                    if len(findings) >= ctx.limits.max_findings_per_job:
                        break
        evidence = [EvidenceArtifact(
            name="osv-scanner.json", kind="raw",
            text=json.dumps({"packages_scanned": pkgs, "findings": len(findings)},
                            ensure_ascii=False), content_type="application/json")]
        return ConnectorResult(
            status="succeeded" if findings else "succeeded_no_findings",
            findings=findings, evidence=evidence,
            summary={"packages": pkgs, "vulns": len(findings)},
            coverage=f"Audited {pkgs} dependency entries against the OSV database.")

    @staticmethod
    def _severity(v: dict) -> str:
        db = v.get("database_specific", {}) or {}
        label = str(db.get("severity", "")).upper()
        if label in OSV_SEV:
            return OSV_SEV[label]
        for s in v.get("severity", []) or []:
            score = s.get("score", "")
            # CVSS vector → coarse bucket
            if "AV:" in str(score):
                return "high"
        return "medium"

    @staticmethod
    def _cwe(v: dict) -> str:
        cwes = (v.get("database_specific", {}) or {}).get("cwe_ids", [])
        return cwes[0] if cwes else ""

    @staticmethod
    def _fix_hint(v: dict, p: dict) -> str:
        fixed = []
        for aff in v.get("affected", []) or []:
            for rng in aff.get("ranges", []) or []:
                for ev in rng.get("events", []) or []:
                    if ev.get("fixed"):
                        fixed.append(ev["fixed"])
        if fixed:
            return f"Upgrade {p.get('name')} to a fixed version: {', '.join(sorted(set(fixed))[:3])}."
        return f"Upgrade {p.get('name')} to a non-vulnerable version."
