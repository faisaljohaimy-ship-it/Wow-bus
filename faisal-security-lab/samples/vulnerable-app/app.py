"""Intentionally vulnerable sample app — the authorized lab target.

This file exists ONLY to exercise the platform's own scanners against a known
set of defects, so findings are reproducible. It is never executed by the
platform; connectors analyze it statically. Do not deploy this.
"""
import hashlib
import subprocess

import requests
import yaml


# Credential-shaped strings for the secret scanner. These are FABRICATED and
# non-functional — they exist only so Gitleaks has a deterministic match on this
# authorized lab target. Do not treat them as real credentials.
GITHUB_TOKEN = "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"  # fake ghp_ + 36 chars
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
API_TOKEN = "sk-test-0000000000000000000000000000demo"


def run(cmd):
    # CWE-78: command injection via shell=True on dynamic input.
    return subprocess.run(cmd, shell=True)


def load(doc):
    # CWE-502: unsafe deserialization.
    return yaml.load(doc)


def calc(expr):
    # CWE-95: eval on dynamic input.
    return eval(expr)


def digest(data):
    # CWE-327: weak hash.
    return hashlib.md5(data).hexdigest()


def fetch(url):
    # CWE-295: TLS verification disabled.
    return requests.get(url, verify=False)
