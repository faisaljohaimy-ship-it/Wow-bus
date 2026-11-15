"""Scope matching and network-destination validation.

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
import os
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


# ---------------------------------------------------------------------------
# Local directories a source scan reads
# ---------------------------------------------------------------------------
def _is_remote(value: str) -> bool:
    """A repository address that is cloned, not a directory on this machine."""
    v = (value or "").strip()
    return v.startswith(("http://", "https://", "git@", "ssh://")) or v.endswith(".git")


def local_source_for(asset: dict, params: dict) -> str | None:
    """The directory on this machine that a source scan of this asset would
    read, or None when the asset is a repository address to clone or has no
    source at all. The worker uses this function too, so the directory that is
    authorized and the directory that is read are chosen in one place.

    Order: the scan request's source_path, the asset's local_path, then the
    identifier of a source or repository asset.
    """
    requested = params.get("source_path")
    if requested is not None and not isinstance(requested, str):
        raise PolicyDenied("source_path must be a directory path",
                           detail={"target": str(requested)})
    src = requested or (asset.get("metadata") or {}).get("local_path")
    if src is not None and not isinstance(src, str):
        raise PolicyDenied("local_path must be a directory path", detail={"target": str(src)})
    if src:
        return src
    if asset.get("kind") in ("repo", "source"):
        ident = asset.get("identifier", "")
        if ident and not _is_remote(ident):
            return ident
    return None


def allowed_entries(scope: dict, asset: dict) -> list:
    """What the scope allows: its allowed targets, or the asset's own
    identifier and nothing else when it names none."""
    return scope.get("allowed_targets") or [asset.get("identifier", "")]


def _real_path(path: str) -> str:
    """The real path of a directory name: "~", ".." and symbolic links are
    resolved. Raises ValueError for text that cannot name a place on this
    machine: a NUL byte in it, or characters that are not valid text."""
    path.encode("utf-8")
    return os.path.realpath(os.path.expanduser(path))


def _directory_of(pattern: str, asset: dict) -> str | None:
    """The real directory an allow-list entry names, or None when the entry
    is a host, a URL or an image name. An entry names a directory when it is
    written as a path, or when it is the identifier of a source asset (with or
    without a slash at the end, on either side). Raises ValueError for an
    entry that is written as a path but cannot be one."""
    p = (pattern or "").strip()
    if p.endswith("/*"):
        p = p[:-2] or "/"
    if not p or "://" in p or p.startswith("git@"):
        return None
    is_path = p.startswith(("/", "~", "./", "../")) or p in (".", "..")
    identifier = (asset.get("identifier") or "").strip().rstrip("/")
    if not is_path and not (asset.get("kind") in ("repo", "source")
                            and p.rstrip("/") == identifier):
        return None
    return _real_path(p)


def _inside(directory: str, base: str) -> bool:
    return directory == base or directory.startswith(base.rstrip(os.sep) + os.sep)


def check_source_dir(scope: dict, asset: dict, directory: str) -> str:
    """Raise PolicyDenied unless `directory` is inside the scope. Returns the
    real path that was compared, which is the one to read.

    Directories are compared as real paths, so "..", a symbolic link or another
    spelling of a place cannot lead outside what was authorized. The directory
    has to be a place an allowed target names, or below one. A scope without
    allowed targets covers the asset's own identifier and nothing else.
    """
    allowed = allowed_entries(scope, asset)
    detail = {"target": str(directory), "allowed": allowed}
    # A name that cannot be a path (a NUL byte in it, for one) is refused like
    # any other place outside the scope; it is not an error of the server.
    try:
        real = _real_path(str(directory))
    except (ValueError, OSError):
        raise PolicyDenied("source directory is not a valid path", detail=detail) from None
    for pattern in scope.get("denied_targets") or []:
        try:
            base = _directory_of(pattern, asset)
        except (ValueError, OSError):
            # What it was meant to exclude cannot be told, so nothing is read.
            raise PolicyDenied("an excluded target of the scope is not a valid path",
                               detail=detail) from None
        if base is not None and _inside(real, base):
            raise PolicyDenied("target is explicitly excluded by scope", detail=detail)
    for pattern in allowed:
        try:
            base = _directory_of(pattern, asset)
        except (ValueError, OSError):
            continue        # such an entry allows nothing
        if base is not None and _inside(real, base):
            return real
    raise PolicyDenied("source directory is outside the authorized scope", detail=detail)


def check_targets(scope: dict, asset: dict, params: dict) -> None:
    # A scope that names no target covers the asset's own identifier only.
    allowed = allowed_entries(scope, asset)
    denied = scope.get("denied_targets") or []
    for t in targets_for(asset, params):
        detail = {"target": t, "allowed": allowed}
        try:
            if denied and target_in_list(t, denied):
                raise PolicyDenied("target is explicitly excluded by scope", detail=detail)
            if not target_in_list(t, allowed):
                raise PolicyDenied("target is outside the authorized scope", detail=detail)
        except ValueError:
            # An address that cannot be read at all, such as "http://[".
            raise PolicyDenied("target is not a valid address", detail=detail) from None
    # The directory a source scan would read is part of what is authorized.
    directory = local_source_for(asset, params)
    if directory is not None:
        check_source_dir(scope, asset, directory)


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
