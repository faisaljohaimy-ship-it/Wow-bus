"""Semgrep SAST connector.

Runs Semgrep over staged source with a bundled offline ruleset (so results are
deterministic and do not depend on registry egress). If FSL_SEMGREP_CONFIG is
set (e.g. 'auto' or 'p/ci') and the registry is reachable it is used instead.
Findings link file + line + rule + a remediation hint.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from ..errors import ConnectorError
from .base import Connector, ConnectorResult, EvidenceArtifact, ExecContext, RawFinding

RULES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "semgrep-rules"
SEV_MAP = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}


class SemgrepConnector(Connector):
    name = "semgrep"
    category = "SAST"
    source = "https://github.com/semgrep/semgrep"
    license = "LGPL-2.1"
    binary = "semgrep"

    def capabilities(self) -> dict:
        return {"active": False, "passive": True, "needs_source": True, "needs_network": False}

    def validate_config(self, params: dict) -> dict:
        p = dict(params or {})
        p["config"] = os.environ.get("FSL_SEMGREP_CONFIG", "") or str(RULES_DIR)
        return p

    def execute(self, ctx: ExecContext) -> ConnectorResult:
        config = ctx.params.get("config") or str(RULES_DIR)
        out_file = ctx.workdir / "semgrep.json"
        argv = ["semgrep", "scan", "--config", config, "--json", "--quiet",
                "--no-git-ignore", "--timeout", str(min(ctx.limits.job_timeout_seconds, 300)),
                "--max-target-bytes", "2000000", "--disable-version-check",
                "--output", str(out_file), str(ctx.input_dir)]
        run = self._run(ctx, argv)
        if run.cancelled:
            raise ConnectorError("semgrep cancelled")
        if run.timed_out:
            from ..errors import TimeoutError_
            raise TimeoutError_("semgrep exceeded its time budget")
        if not out_file.exists():
            raise ConnectorError(
                "semgrep produced no report",
                detail={"returncode": run.returncode,
                        "stderr": run.stderr.decode("utf-8", "replace")[:500]})
        try:
            report = json.loads(out_file.read_text(encoding="utf-8"))
        except ValueError as e:
            raise ConnectorError(f"semgrep output invalid JSON: {e}")

        findings = []
        for r in report.get("results", [])[: ctx.limits.max_findings_per_job]:
            extra = r.get("extra", {})
            meta = extra.get("metadata", {}) or {}
            cwe = meta.get("cwe")
            cwe = cwe[0] if isinstance(cwe, list) and cwe else (cwe or "")
            rel = self._relpath(ctx, r.get("path", ""))
            check_id = str(r.get("check_id", ""))
            # Local-rules check_ids are prefixed with the filesystem path; keep
            # the final rule name. Registry ids (namespaced) are left intact.
            if config in check_id or "/" in config and config.strip("/").replace("/", ".") in check_id:
                check_id = check_id.split(".")[-1]
            findings.append(RawFinding(
                rule_id=check_id[:200],
                title=str(extra.get("message", r.get("check_id", "")))[:200],
                severity=SEV_MAP.get(str(extra.get("severity", "INFO")).upper(), "low"),
                confidence={"HIGH": "high", "MEDIUM": "medium", "LOW": "low"}.get(
                    str(meta.get("confidence", "")).upper(), "medium"),
                location={"file": rel, "line": r.get("start", {}).get("line"),
                          "end_line": r.get("end", {}).get("line")},
                description=str(extra.get("message", "")),
                remediation="; ".join(meta.get("references", [])[:2]) or
                            "Review the Semgrep rule guidance for a fix.",
                cwe=str(cwe)[:120],
                tags=["sast"] + list(meta.get("category", []) if isinstance(meta.get("category"), list) else ([meta["category"]] if meta.get("category") else [])),
                fingerprint=f"{r.get('check_id')}:{rel}:{r.get('start', {}).get('line')}"))

        errors = report.get("errors", [])
        partial = bool(errors)
        evidence = [EvidenceArtifact(
            name="semgrep.json", kind="raw",
            text=json.dumps({"results_count": len(report.get("results", [])),
                             "errors": errors[:10], "paths": report.get("paths", {})},
                            ensure_ascii=False, indent=2), content_type="application/json")]
        status = "succeeded" if findings else ("partial" if partial else "succeeded_no_findings")
        return ConnectorResult(
            status=status, findings=findings, evidence=evidence, partial=partial,
            summary={"results": len(findings), "errors": len(errors), "config": config},
            coverage=f"Semgrep ruleset: {config}. {len(errors)} rule/parse errors." if errors
                     else f"Semgrep ruleset: {config}.")

    def _run(self, ctx, argv):
        from .base import run_tool
        return run_tool(argv, ctx=ctx, cwd=ctx.workdir,
                        timeout=min(ctx.limits.job_timeout_seconds, 320))

    @staticmethod
    def _relpath(ctx, p):
        try:
            return str(Path(p).resolve().relative_to(ctx.input_dir.resolve()))
        except (ValueError, OSError):
            return Path(p).name
