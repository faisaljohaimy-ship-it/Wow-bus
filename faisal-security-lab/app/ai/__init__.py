"""AI assistance layer: planner, triage, remediation, validation, reporting.

Design rules (enforced, not aspirational):
  * The model only ever returns STRUCTURED JSON matching a fixed schema. There
    is no field through which it can launch a tool, change a scope, read a
    secret, or choose a network destination. The schema IS the security
    boundary; an independent validator rejects anything off-schema.
  * Untrusted content (tool output, scanned code, web text, reports) is wrapped
    in a data envelope by the sanitizer and labelled as data, never merged into
    the instruction channel.
  * Model text is never executed as shell or code.
  * With no provider configured the layer degrades to deterministic, rule-based
    output and marks ai_available=false — scans that do not need AI keep working.
"""
from .provider import get_provider, AIResult

__all__ = ["get_provider", "AIResult"]
