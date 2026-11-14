"""Faisal Security Lab — standalone defensive security testing & AI triage platform.

A dependency-light (Python standard library only for the core) platform that
unifies authorized security tooling behind a single execution contract, enforces
an auditable authorization/scope model at both the API and the worker, and layers
AI assistance for triage, remediation proposals and verification on top of
evidence that can be re-verified.

The security tools themselves (Semgrep, Gitleaks, Trivy, OSV-Scanner, Bandit,
pip-audit, ...) are external programs invoked through isolated, bounded, no-shell
subprocess connectors. Nothing in this package executes attacker-controlled input
as code or shell.
"""

from .version import __version__

__all__ = ["__version__"]
