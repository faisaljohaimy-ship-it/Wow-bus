"""Passive TLS certificate inspection (standard library).

Performs a verified TLS handshake to the authorized destination and reports the
certificate's validity window, issuer/subject, protocol and cipher. Flags
near-expiry and legacy protocols. Non-mutating.
"""
from __future__ import annotations

import datetime as dt
import socket
import ssl

from .. import scope as scope_mod
from ..errors import ConfigError, ConnectorError
from .base import Connector, ConnectorResult, EvidenceArtifact, ExecContext, RawFinding


def _parse_cert_time(value: str) -> dt.datetime | None:
    try:
        return dt.datetime.strptime(value, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=dt.timezone.utc)
    except (ValueError, TypeError):
        return None


class TlsCertificateConnector(Connector):
    name = "tls_certificate"
    category = "network/crypto"
    source = "python-standard-library"
    license = "PSF"
    connector_type = "network"
    egress = ["<scope-authorized target host>"]

    def capabilities(self) -> dict:
        return {"active": True, "passive": True, "needs_source": False, "needs_network": True}

    def validate_config(self, params: dict) -> dict:
        target = (params or {}).get("target") or (params or {}).get("host") or ""
        if not target:
            raise ConfigError("tls_certificate requires a 'target' host")
        port = int((params or {}).get("port", 443))
        return {"target": target, "port": port}

    def execute(self, ctx: ExecContext) -> ConnectorResult:
        target = ctx.params["target"]
        port = ctx.params.get("port", 443)
        dest = scope_mod.validated_destination(
            target if "://" in target else f"https://{target}:{port}",
            allow_private=ctx.allow_private)
        host, ip = dest["host"], dest["ips"][0]

        sslctx = ssl.create_default_context()
        try:
            with socket.create_connection((ip, port), timeout=ctx.limits.network_connect_timeout) as raw:
                with sslctx.wrap_socket(raw, server_hostname=host) as tls:
                    cert = tls.getpeercert()
                    proto = tls.version()
                    cipher = tls.cipher()
        except (OSError, ssl.SSLError) as e:
            raise ConnectorError(f"TLS handshake to {host}:{port} failed: {e}")

        not_after = _parse_cert_time(cert.get("notAfter", ""))
        not_before = _parse_cert_time(cert.get("notBefore", ""))
        issuer = dict(x[0] for x in cert.get("issuer", []))
        subject = dict(x[0] for x in cert.get("subject", []))
        now = dt.datetime.now(dt.timezone.utc)

        findings = []
        if not_after:
            days = (not_after - now).days
            if days < 0:
                findings.append(RawFinding(
                    rule_id="tls-cert-expired", title="TLS certificate is expired",
                    severity="high", confidence="high",
                    location={"host": host, "port": port},
                    description=f"Certificate expired on {cert.get('notAfter')}.",
                    remediation="Renew and deploy a valid certificate.",
                    cwe="CWE-324", tags=["tls"], fingerprint=f"{host}:{port}:expired"))
            elif days < 21:
                findings.append(RawFinding(
                    rule_id="tls-cert-near-expiry",
                    title=f"TLS certificate expires in {days} days",
                    severity="medium", confidence="high",
                    location={"host": host, "port": port},
                    description=f"Certificate valid until {cert.get('notAfter')}.",
                    remediation="Schedule renewal before expiry.",
                    cwe="CWE-324", tags=["tls"], fingerprint=f"{host}:{port}:near-expiry"))
        if proto in ("TLSv1", "TLSv1.1", "SSLv3"):
            findings.append(RawFinding(
                rule_id="tls-legacy-protocol",
                title=f"Legacy TLS protocol negotiated: {proto}",
                severity="medium", confidence="high",
                location={"host": host, "port": port},
                description=f"The server negotiated {proto}, which is deprecated.",
                remediation="Disable TLS < 1.2 and prefer TLS 1.3.",
                cwe="CWE-327", tags=["tls"], fingerprint=f"{host}:{port}:legacy-proto"))

        evidence = [EvidenceArtifact(
            name="tls-certificate.txt", kind="raw",
            text=(f"host={host} ip={ip} port={port}\nprotocol={proto}\ncipher={cipher}\n"
                  f"notBefore={cert.get('notBefore')}\nnotAfter={cert.get('notAfter')}\n"
                  f"issuer={issuer}\nsubject={subject}\n"
                  f"subjectAltName={cert.get('subjectAltName')}"))]

        return ConnectorResult(
            status="succeeded" if findings else "succeeded_no_findings",
            findings=findings, evidence=evidence,
            summary={"protocol": proto, "cipher": cipher[0] if cipher else None,
                     "not_after": cert.get("notAfter"),
                     "days_remaining": (not_after - now).days if not_after else None},
            coverage="Verified TLS handshake; certificate metadata and protocol only.")
