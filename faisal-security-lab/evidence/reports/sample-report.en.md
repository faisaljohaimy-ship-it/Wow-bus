# Defensive Security Report

**Project:** Sample Lab Report  
**Generated:** 2026-11-14T17:52:03+00:00  
**Platform:** Faisal Security Lab v2.0.0

> Evidence is redacted. Sensitive values are withheld. Findings require human review.

## Executive summary

**By severity:** critical=0, high=35, medium=5, low=3, info=0
**Verified fixes:** 0

## Findings

| Severity | Priority | Tool | Location | Verification | Status | Title |
|---|---|---|---|---|---|---|
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2026-1994 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2019-132 |
| high | 82 | pip_audit | `jinja2` | needs_verification | open | jinja2 2.10: PYSEC-2026-1474 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2019-133 |
| high | 82 | pip_audit | `jinja2` | needs_verification | open | jinja2 2.10: PYSEC-2026-1475 |
| high | 82 | pip_audit | `pyyaml` | needs_verification | open | pyyaml 5.1: PYSEC-2021-142 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2026-1995 |
| high | 82 | pip_audit | `requests` | needs_verification | open | requests 2.19.1: PYSEC-2026-2275 |
| high | 82 | pip_audit | `requests` | needs_verification | open | requests 2.19.1: PYSEC-2026-1873 |
| high | 82 | pip_audit | `requests` | needs_verification | open | requests 2.19.1: PYSEC-2026-1872 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2026-1999 |
| high | 82 | pip_audit | `idna` | needs_verification | open | idna 2.7: PYSEC-2026-215 |
| high | 82 | pip_audit | `requests` | needs_verification | open | requests 2.19.1: PYSEC-2023-74 |
| high | 82 | pip_audit | `jinja2` | needs_verification | open | jinja2 2.10: PYSEC-2021-66 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2023-192 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2026-1996 |
| high | 82 | pip_audit | `pyyaml` | needs_verification | open | pyyaml 5.1: PYSEC-2020-96 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2026-141 |
| high | 82 | pip_audit | `jinja2` | needs_verification | open | jinja2 2.10: PYSEC-2019-217 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2026-4177 |
| high | 82 | pip_audit | `idna` | needs_verification | open | idna 2.7: PYSEC-2024-60 |
| high | 82 | pip_audit | `pyyaml` | needs_verification | open | pyyaml 5.1: PYSEC-2020-176 |
| high | 82 | pip_audit | `jinja2` | needs_verification | open | jinja2 2.10: PYSEC-2026-1471 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2020-148 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2023-212 |
| high | 82 | pip_audit | `urllib3` | needs_verification | open | urllib3 1.23: PYSEC-2023-207 |
| high | 82 | pip_audit | `jinja2` | needs_verification | open | jinja2 2.10: PYSEC-2026-1473 |
| high | 82 | pip_audit | `requests` | needs_verification | open | requests 2.19.1: PYSEC-2018-28 |
| high | 82 | bandit | `app.py:24` | needs_verification | open | subprocess_popen_with_shell_equals_true |
| high | 82 | bandit | `app.py:44` | needs_verification | open | request_with_no_cert_validation |
| high | 82 | bandit | `app.py:39` | needs_verification | open | hashlib |
| high | 77 | gitleaks | `app.py:17` | needs_verification | open | Potential secret=«redacted» a GitHub Personal Access Token, potentially leading to unauthorized repository access and sensitive content exposure. |
| high | 77 | semgrep | `app.py:44` | needs_verification | open | Disabling TLS verification (verify=False) allows machine-in-the-middle attacks. Keep certificate verification enabled. |
| high | 77 | semgrep | `app.py:24` | needs_verification | open | subprocess call with shell=True can lead to OS command injection when any argument is attacker-influenced. Pass an argument list and shell=False. |
| high | 77 | semgrep | `app.py:34` | needs_verification | open | Use of eval()/exec() on dynamic input allows arbitrary code execution. Avoid eval/exec; parse data explicitly. |
| medium | 55 | bandit | `app.py:29` | needs_verification | open | yaml_load |
| medium | 55 | bandit | `app.py:34` | needs_verification | open | blacklist |
| medium | 50 | semgrep | `app.py:29` | needs_verification | open | yaml.load without SafeLoader can instantiate arbitrary Python objects. Use yaml.safe_load(). |
| medium | 50 | semgrep | `app.py:39` | needs_verification | open | MD5 is cryptographically broken. Use SHA-256 or better for security purposes (not for passwords — use a KDF). |
| medium | 40 | bandit | `app.py:44` | needs_verification | open | request_without_timeout |
| low | 27 | bandit | `app.py:8` | needs_verification | open | blacklist |
| low | 22 | bandit | `app.py:17` | needs_verification | open | hardcoded_password_string |
| low | 22 | bandit | `app.py:19` | needs_verification | open | hardcoded_password_string |