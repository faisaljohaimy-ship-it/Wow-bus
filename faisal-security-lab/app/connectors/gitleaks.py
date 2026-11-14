"""Gitleaks secret-scanning connector.

Scans staged source for committed secrets. Runs with --redact so Gitleaks
itself never writes the secret value into the report; the platform redacts a
second time on display/export. Findings expose location + rule only.
"""
from __future__ import annotations

import json
from pathlib import Path

from ..errors import ConnectorError, TimeoutError_
from .base import Connector, ConnectorResult, EvidenceArtifact, ExecContext, RawFinding, run_tool


class GitleaksConnector(Connector):
    name = "gitleaks"
    category = "secrets"
    source = "https://github.com/gitleaks/gitleaks"
    license = "MIT"
    binary = "gitleaks"

    def capabilities(self) -> dict:
        return {"active": False, "passive": True, "needs_source": True, "needs_network": False}

    def execute(self, ctx: ExecContext) -> ConnectorResult:
        out_file = ctx.workdir / "gitleaks.json"
        # `gitleaks dir` scans a filesystem path (no git history required).
        argv = ["gitleaks", "dir", str(ctx.input_dir), "--report-format", "json",
                "--report-path", str(out_file), "--redact", "--exit-code", "0",
                "--no-banner"]
        run = run_tool(argv, ctx=ctx, cwd=ctx.workdir)
        if run.cancelled:
            raise ConnectorError("gitleaks cancelled")
        if run.timed_out:
            raise TimeoutError_("gitleaks exceeded its time budget")
        if not out_file.exists():
            # Older/newer CLIs: fall back to `detect --no-git`.
            argv2 = ["gitleaks", "detect", "--source", str(ctx.input_dir), "--no-git",
                     "--report-format", "json", "--report-path", str(out_file),
                     "--redact", "--exit-code", "0", "--no-banner"]
            run = run_tool(argv2, ctx=ctx, cwd=ctx.workdir)
        if not out_file.exists():
            raise ConnectorError(
                "gitleaks produced no report",
                detail={"returncode": run.returncode,
                        "stderr": run.stderr.decode("utf-8", "replace")[:500]})
        try:
            leaks = json.loads(out_file.read_text(encoding="utf-8") or "[]")
        except ValueError as e:
            raise ConnectorError(f"gitleaks output invalid JSON: {e}")
        if not isinstance(leaks, list):
            leaks = []

        findings = []
        for leak in leaks[: ctx.limits.max_findings_per_job]:
            rel = self._relpath(ctx, leak.get("File", ""))
            rule = leak.get("RuleID", "secret")
            line = leak.get("StartLine")
            findings.append(RawFinding(
                rule_id=f"gitleaks:{rule}",
                title=f"Potential secret: {leak.get('Description', rule)}",
                severity="high", confidence="medium",
                location={"file": rel, "line": line},
                description=("A credential-shaped string was detected. The value is "
                             "redacted. Confirm whether it is a live secret and rotate "
                             "it if so."),
                remediation="Remove the secret from source, rotate it, and load it from a "
                            "secret manager or environment variable.",
                cwe="CWE-798",
                tags=["secret", str(rule)],
                fingerprint=f"{rule}:{rel}:{line}"))

        evidence = [EvidenceArtifact(
            name="gitleaks-summary.txt", kind="raw",
            text=f"leaks={len(leaks)} (values redacted by gitleaks --redact)\n" +
                 "\n".join(f"- {l.get('RuleID')} {self._relpath(ctx, l.get('File',''))}:"
                           f"{l.get('StartLine')}" for l in leaks[:50]))]
        return ConnectorResult(
            status="succeeded" if findings else "succeeded_no_findings",
            findings=findings, evidence=evidence,
            summary={"leaks": len(leaks)},
            coverage="Filesystem secret scan (no git history). Secret values redacted.")

    @staticmethod
    def _relpath(ctx, p):
        try:
            return str(Path(p).resolve().relative_to(ctx.input_dir.resolve()))
        except (ValueError, OSError):
            return p or ""
