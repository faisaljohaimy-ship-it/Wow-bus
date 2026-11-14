"""Bandit Python SAST connector. Static analysis only — never executes source."""
from __future__ import annotations

import json
from pathlib import Path

from ..errors import ConnectorError, TimeoutError_
from .base import Connector, ConnectorResult, EvidenceArtifact, ExecContext, RawFinding, run_tool

SEV_MAP = {"LOW": "low", "MEDIUM": "medium", "HIGH": "high"}


class BanditConnector(Connector):
    name = "bandit"
    category = "SAST"
    source = "https://github.com/PyCQA/bandit"
    license = "Apache-2.0"
    binary = "bandit"

    def capabilities(self) -> dict:
        return {"active": False, "passive": True, "needs_source": True, "needs_network": False}

    def execute(self, ctx: ExecContext) -> ConnectorResult:
        out_file = ctx.workdir / "bandit.json"
        argv = ["bandit", "-r", str(ctx.input_dir), "-f", "json", "-q", "-o", str(out_file)]
        run = run_tool(argv, ctx=ctx, cwd=ctx.workdir)
        if run.cancelled:
            raise ConnectorError("bandit cancelled")
        if run.timed_out:
            raise TimeoutError_("bandit exceeded its time budget")
        # Bandit exits 0 (no issues) or 1 (issues found); both are successful runs.
        if not out_file.exists():
            raise ConnectorError(
                "bandit produced no report",
                detail={"returncode": run.returncode,
                        "stderr": run.stderr.decode("utf-8", "replace")[:500]})
        try:
            report = json.loads(out_file.read_text(encoding="utf-8"))
        except ValueError as e:
            raise ConnectorError(f"bandit output invalid JSON: {e}")

        findings = []
        for r in report.get("results", [])[: ctx.limits.max_findings_per_job]:
            rel = self._relpath(ctx, r.get("filename", ""))
            cwe = (r.get("issue_cwe") or {}).get("id")
            findings.append(RawFinding(
                rule_id=f"bandit:{r.get('test_id', '')}",
                title=str(r.get("test_name", r.get("test_id", "")))[:200],
                severity=SEV_MAP.get(str(r.get("issue_severity", "")).upper(), "low"),
                confidence={"LOW": "low", "MEDIUM": "medium", "HIGH": "high"}.get(
                    str(r.get("issue_confidence", "")).upper(), "medium"),
                location={"file": rel, "line": r.get("line_number")},
                description=str(r.get("issue_text", "")),
                remediation="Review this static-analysis indicator and apply the secure "
                            "pattern for the flagged API.",
                cwe=f"CWE-{cwe}" if cwe else "",
                tags=["sast", "python"],
                fingerprint=f"{r.get('test_id')}:{rel}:{r.get('line_number')}"))

        errors = report.get("errors", [])
        evidence = [EvidenceArtifact(
            name="bandit-summary.json", kind="raw",
            text=json.dumps({"results": len(report.get("results", [])),
                             "errors": errors[:10],
                             "metrics": report.get("metrics", {}).get("_totals", {})},
                            ensure_ascii=False, indent=2),
            content_type="application/json")]
        status = "succeeded" if findings else ("partial" if errors else "succeeded_no_findings")
        return ConnectorResult(
            status=status, findings=findings, evidence=evidence, partial=bool(errors),
            summary={"results": len(findings), "errors": len(errors)},
            coverage="Static analysis of Python source; code is not executed.")

    @staticmethod
    def _relpath(ctx, p):
        try:
            return str(Path(p).resolve().relative_to(ctx.input_dir.resolve()))
        except (ValueError, OSError):
            return Path(p).name
