"""Scope matching and network-destination validation.

Carries forward the hardened patterns from the original runner.py:
  * canonical host parsing (reject tricks, require exact ASCII/punycode)
  * private / loopback / link-local CIDR blocks (SSRF)
  * never auto-follow redirects; validate every hop's destination
A network connector MUST route its connection through `validated_destination`
so that DNS rebinding / redirect to an internal service is blocked even when the
scope's allowlist text looks fine.
"""
from __future__ import annotations

import datetime as dt
import ipaddress
import re
import socket
from urllib.parse import urlsplit

from .errors import PolicyDenied, ValidationError

PRIVATE_RANGES = tuple(ipaddress.ip_network(n) for n in (
    "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
    "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16", "198.18.0.0/15",
    "::1/128", "fc00::/7", "fe80::/10", "::ffff:0:0/96",
))

_LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def canonical_host(raw: str) -> str:
    value = (raw or "").strip().lower().rstrip(".")
    if not value or len(value) > 253 or any(c in value for c in "%\\/@ \t\r\n"):
        raise ValidationError("invalid hostname")
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        for label in value.split("."):
            if not _LABEL.match(label):
                raise ValidationError("use an exact ASCII or punycode hostname")
        return value


def is_private_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True  # unparseable → treat as unsafe
    return any(addr in net for net in PRIVATE_RANGES)


def resolve_ips(host: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise ValidationError(f"DNS resolution failed for {host}: {e}")
    return sorted({info[4][0] for info in infos})


def validated_destination(url_or_host: str, *, allow_private: bool) -> dict:
    """Resolve a URL/host and confirm no resolved address is private unless the
    scope explicitly authorizes an internal asset. Returns dict with host, ips,
    port, scheme. Raises PolicyDenied on an internal/forbidden destination."""
    if "://" in url_or_host:
        parts = urlsplit(url_or_host)
        host = parts.hostname or ""
        scheme = parts.scheme
        port = parts.port or (443 if scheme == "https" else 80)
    else:
        host = url_or_host
        scheme = "https"
        port = 443
    host = canonical_host(host)
    ips = resolve_ips(host)
    if not allow_private:
        for ip in ips:
            if is_private_ip(ip):
                raise PolicyDenied(
                    "destination resolves to a private/internal address",
                    detail={"host": host, "ip": ip})
    return {"host": host, "ips": ips, "port": port, "scheme": scheme}


# ---------------------------------------------------------------------------
# Target matching against a scope
# ---------------------------------------------------------------------------
def _norm(s: str) -> str:
    return (s or "").strip().lower().rstrip("/")


def target_in_list(target: str, patterns: list[str]) -> bool:
    """A target matches if it equals a pattern, is a host under a pattern host,
    or is a path/url under a pattern prefix. Patterns are exact — no wildcards
    beyond an explicit trailing '/*' path prefix or a leading '*.' host suffix."""
    t = _norm(target)
    for raw in patterns:
        p = _norm(raw)
        if not p:
            continue
        if t == p:
            return True
        if p.startswith("*.") and (t == p[2:] or t.endswith("." + p[2:])):
            return True
        if p.endswith("/*") and (t == p[:-2] or t.startswith(p[:-1])):
            return True
        # host-prefix of a URL target
        if "://" in t:
            th = _norm(urlsplit(target).hostname or "")
            if th == p or (p.startswith("*.") and th.endswith("." + p[2:])):
                return True
    return False


def targets_for(asset: dict, params: dict) -> list[str]:
    """Derive the concrete target(s) a job will touch, for scope checking."""
    targets = [asset.get("identifier", "")]
    for key in ("target", "url", "host", "repo_path", "image"):
        v = params.get(key)
        if isinstance(v, str) and v:
            targets.append(v)
        elif isinstance(v, list):
            targets.extend([x for x in v if isinstance(x, str)])
    return [t for t in targets if t]


def check_targets(scope: dict, asset: dict, params: dict) -> None:
    allowed = scope.get("allowed_targets") or []
    denied = scope.get("denied_targets") or []
    # If the scope declares an allowlist, every target must be inside it.
    for t in targets_for(asset, params):
        if denied and target_in_list(t, denied):
            raise PolicyDenied("target is explicitly excluded by scope",
                               detail={"target": t})
        if allowed and not target_in_list(t, allowed):
            raise PolicyDenied("target is outside the authorized scope",
                               detail={"target": t, "allowed": allowed})


def within_window(scope: dict, when: dt.datetime | None = None) -> None:
    when = when or dt.datetime.now(dt.timezone.utc)
    vf, vu = scope.get("valid_from"), scope.get("valid_until")
    now_iso = when.replace(microsecond=0).isoformat()
    if vf and now_iso < vf:
        raise PolicyDenied("authorization not yet valid", detail={"valid_from": vf})
    if vu and now_iso > vu:
        raise PolicyDenied("authorization window has expired", detail={"valid_until": vu})
    window = scope.get("window") or {}
    start, end = window.get("start_hour_utc"), window.get("end_hour_utc")
    if start is not None and end is not None:
        h = when.hour
        inside = (start <= h < end) if start <= end else (h >= start or h < end)
        if not inside:
            raise PolicyDenied("outside the allowed run window of day",
                               detail={"window": window, "hour_utc": h})
