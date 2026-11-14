"""Passive HTTP security-header inspection (standard library).

Sends ONE request to the authorized destination and reports selected security
headers. It validates the destination (no private addresses unless the scope
authorizes an internal asset), connects to a validated IP with the correct SNI
to defeat DNS-rebinding, and never auto-follows redirects.
"""
from __future__ import annotations

import http.client
import socket
import ssl

from .. import scope as scope_mod
from ..errors import ConfigError, ConnectorError
from .base import Connector, ConnectorResult, EvidenceArtifact, ExecContext, RawFinding

SECURITY_HEADERS = {
    "strict-transport-security": ("high", "Enforce HTTPS with HSTS to prevent protocol downgrade."),
    "content-security-policy": ("high", "Add a Content-Security-Policy to mitigate XSS and injection."),
    "x-content-type-options": ("medium", "Set 'X-Content-Type-Options: nosniff'."),
    "x-frame-options": ("medium", "Set X-Frame-Options or CSP frame-ancestors to prevent clickjacking."),
    "referrer-policy": ("low", "Set a Referrer-Policy to limit referrer leakage."),
    "permissions-policy": ("low", "Set a Permissions-Policy to restrict powerful browser features."),
}


class HttpHeadersConnector(Connector):
    name = "http_headers"
    category = "network/web"
    source = "python-standard-library"
    license = "PSF"
    connector_type = "network"
    egress = ["<scope-authorized target host>"]

    def capabilities(self) -> dict:
        return {"active": True, "passive": True, "needs_source": False, "needs_network": True}

    def validate_config(self, params: dict) -> dict:
        target = (params or {}).get("target") or (params or {}).get("url") or ""
        if not target:
            raise ConfigError("http_headers requires a 'target' URL")
        if "://" not in target:
            target = "https://" + target
        return {"target": target}

    def execute(self, ctx: ExecContext) -> ConnectorResult:
        target = ctx.params["target"]
        dest = scope_mod.validated_destination(target, allow_private=ctx.allow_private)
        host, port, scheme = dest["host"], dest["port"], dest["scheme"]
        ip = dest["ips"][0]
        timeout = ctx.limits.network_connect_timeout

        try:
            if scheme == "https":
                sslctx = ssl.create_default_context()
                raw = socket.create_connection((ip, port), timeout=timeout)
                sock = sslctx.wrap_socket(raw, server_hostname=host)
                conn = http.client.HTTPConnection(host, port, timeout=ctx.limits.network_total_timeout)
                conn.sock = sock
            else:
                conn = http.client.HTTPConnection(ip, port, timeout=timeout)
            conn.request("GET", "/", headers={"Host": host, "User-Agent": "faisal-security-lab/2.0",
                                              "Accept": "*/*", "Connection": "close"})
            resp = conn.getresponse()
            status = resp.status
            headers = {k.lower(): v for k, v in resp.getheaders()}
            resp.read(1)  # don't pull the body
            conn.close()
        except (OSError, ssl.SSLError, http.client.HTTPException) as e:
            raise ConnectorError(f"request to {host} failed: {e}")

        findings = []
        present, missing = [], []
        for header, (sev, remediation) in SECURITY_HEADERS.items():
            if header in headers:
                present.append(header)
            else:
                missing.append(header)
                findings.append(RawFinding(
                    rule_id=f"missing-header:{header}",
                    title=f"Missing security header: {header}",
                    severity=sev, confidence="high",
                    location={"url": f"{scheme}://{host}:{port}/"},
                    description=(f"Response status {status} did not include the '{header}' "
                                 "security header. This is an observation, not a confirmed "
                                 "exploitable vulnerability."),
                    remediation=remediation,
                    cwe="CWE-693",
                    tags=["header", "passive"],
                    fingerprint=f"{host}:{port}:missing:{header}"))

        redirect = None
        if 300 <= status < 400 and "location" in headers:
            redirect = headers["location"]

        evidence = [EvidenceArtifact(
            name="http-headers.txt", kind="raw",
            text=(f"GET {scheme}://{host}:{port}/  (connected IP {ip})\n"
                  f"status={status}\nredirect={redirect}\n"
                  f"present_security_headers={present}\nmissing={missing}\n"
                  + "\n".join(f"{k}: {v}" for k, v in sorted(headers.items()))))]

        status_str = "succeeded" if findings else "succeeded_no_findings"
        return ConnectorResult(
            status=status_str, findings=findings, evidence=evidence,
            summary={"http_status": status, "present": present, "missing": missing,
                     "redirect": redirect, "connected_ip": ip},
            coverage="Single non-mutating GET; security headers only. Body not analyzed.")
