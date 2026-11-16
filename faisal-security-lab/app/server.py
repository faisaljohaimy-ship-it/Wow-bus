"""Standalone HTTP API + static UI host (Python standard library only).

Run:  python3 -m app.server      (serves API + UI, starts an in-process worker)

Security posture:
  * Identity is verified server-side via signed session tokens; client-supplied
    identity headers are never trusted.
  * Every state-changing route re-derives the principal and checks RBAC +
    (for scans) the policy engine, so a direct API call cannot bypass the UI.
  * Response security headers, request-size caps, and a simple per-IP rate limit.
  * Optional public read-only view (FSL_PUBLIC_VIEW=1, off by default): a
    request with no Authorization header may resolve a guest principal, but only
    on GET routes explicitly registered with guest_ok=True. The guest has no
    global role and is a reader of one demo project, so the per-project checks
    in each handler confine it; every POST and every other route still needs a
    session. A request that carries a bad or expired token is always 401.
    Whatever a guest is sent first passes through app/guest_view.py (no
    evidence text, no server paths), applied in one place: Handler._dispatch.
"""
from __future__ import annotations

import datetime
import heapq
import ipaddress
import json
import math
import re
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urlsplit, parse_qs

from . import (audit, auth, crypto, demo, evidence, findings as F, guest_view, lab, metrics, policy,
               queue, reports, sim, store, teams, util)
from .ai import agents, evalset
from .bootstrap import ADMIN_NOTICES, SETUP_NOTICES, describe_notice, init_platform
from .config import get_config
from .connectors import all_connectors, connector_names, get_connector, sync_registry
from .errors import (AppError, AuthError, ConflictError, ForbiddenError, NotFoundError, RateLimitError,
                     ValidationError)

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

_ROUTES: list = []
_RATE: dict = {}
_RATE_LOCK = threading.Lock()


def route(method: str, pattern: str, *, auth_required: bool = True, min_global: str | None = None,
          guest_ok: bool = False):
    """Register a handler.

    guest_ok=True puts a route on the public read-only allowlist: with
    FSL_PUBLIC_VIEW on, a request without credentials reaches it as the guest
    principal instead of getting 401. It is only accepted on authenticated GET
    routes without a global-role requirement; anything else is a programming
    error caught at import time."""
    if guest_ok and (method != "GET" or not auth_required or min_global):
        raise ValueError(f"guest_ok is only valid on plain authenticated GET routes: "
                         f"{method} {pattern}")
    rx = re.compile("^" + pattern + "$")

    def deco(fn):
        _ROUTES.append((method, rx, fn, auth_required, min_global, guest_ok))
        return fn
    return deco


class Req:
    def __init__(self, principal, params, query, body, token=None, client_ip="",
                 client_source="peer", proxy_headers_ignored=False):
        self.principal = principal
        self.params = params
        self.query = query
        self.body = body or {}
        self.client_ip = client_ip
        # Where client_ip came from ("header", "forwarded" or "peer"), and
        # whether the request carried proxy headers that were not believed.
        self.client_source = client_source
        self.proxy_headers_ignored = proxy_headers_ignored
        self.token = token

    def q(self, key, default=None):
        v = self.query.get(key)
        return v[0] if isinstance(v, list) and v else default


# ===========================================================================
# Auth + identity
# ===========================================================================
# --- client address --------------------------------------------------------
# Headers a reverse proxy uses to pass the client address on. A client can send
# any of them itself, so they are believed only when the operator has declared
# what sits in front of the service: FSL_CLIENT_IP_HEADER names one header the
# proxy always overwrites, FSL_TRUSTED_PROXY_HOPS counts the proxies that each
# append one entry to X-Forwarded-For. With neither set, the socket peer is the
# client and these headers are ignored.
_PROXY_HEADERS = ("X-Forwarded-For", "Forwarded", "CF-Connecting-IP", "True-Client-IP",
                  "Fly-Client-IP")


def _ip_text(value) -> str | None:
    """Canonical text of an IP address (IPv4-mapped IPv6 as IPv4), else None.

    An IPv6 zone ("fe80::1%eth0") is dropped: it only means something on the
    host that wrote it, and it may be any text of any length, which must not
    reach the audit log or a response as part of an address.
    """
    try:
        ip = ipaddress.ip_address(str(value or "").strip())
    except ValueError:
        return None
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        elif ip.scope_id is not None:
            ip = ipaddress.IPv6Address(int(ip))
    return str(ip)


def resolve_client(headers, peer: str) -> tuple[str, str]:
    """Return (address, source) for a request with these headers and socket peer.

    source is "header" (the configured single-value header), "forwarded" (the
    X-Forwarded-For entry appended by the outermost trusted proxy) or "peer".
    A configured source that is missing, repeated or not an address is not
    used; the next one down applies instead.
    """
    cfg = get_config()
    if cfg.client_ip_header:
        lines = headers.get_all(cfg.client_ip_header) or []
        if len(lines) == 1:
            address = _ip_text(lines[0])
            if address:
                return address, "header"
    hops = cfg.trusted_proxy_hops
    if hops > 0:
        joined = ",".join(str(line) for line in headers.get_all("X-Forwarded-For") or [])
        entries = [e.strip() for e in joined.split(",") if e.strip()]
        if len(entries) >= hops:
            address = _ip_text(entries[-hops])
            if address:
                return address, "forwarded"
    return _ip_text(peer) or str(peer or "")[:64], "peer"


def client_address_report(cfg, env) -> list[str]:
    """Start-up log lines saying where client addresses will be taken from.

    A wrong answer here is silent in normal use (sign-in limits end up shared
    by every visitor), so the mode is stated once, along with any proxy
    setting that was given but could not be used.
    """
    sources = []
    if cfg.client_ip_header:
        sources.append(f"the {cfg.client_ip_header} header")
    if cfg.trusted_proxy_hops:
        sources.append(f"X-Forwarded-For behind {cfg.trusted_proxy_hops} trusted "
                       f"prox{'y' if cfg.trusted_proxy_hops == 1 else 'ies'}")
    if sources:
        lines = [f"[init] client address: {', then '.join(sources)}, "
                 "else the connecting address"]
    else:
        lines = ["[init] client address: the connecting address; proxy headers are ignored "
                 "(behind a proxy, set FSL_CLIENT_IP_HEADER or FSL_TRUSTED_PROXY_HOPS)"]
    if env.get("FSL_CLIENT_IP_HEADER", "").strip() and not cfg.client_ip_header:
        lines.append("[setup] FSL_CLIENT_IP_HEADER is not a header name (letters, digits "
                     "and hyphens) and was ignored.")
    hops = env.get("FSL_TRUSTED_PROXY_HOPS", "").strip()
    if hops:
        try:
            given = int(hops)
        except ValueError:
            given = None
        if given != cfg.trusted_proxy_hops:
            lines.append("[setup] FSL_TRUSTED_PROXY_HOPS is not a whole number from 0 to 10; "
                         f"using {cfg.trusted_proxy_hops}.")
    return lines


_PROXY_HEADERS_REPORTED = False


def _report_ignored_proxy_headers(declared: bool) -> None:
    """Log, once per process, that a request carried forwarding headers that
    were not used for the client address.

    `declared` says whether a proxy setting is in effect. Without one the
    headers are ignored by design; with one, the request did not carry what
    the setting names, which is what a wrong header name looks like.
    """
    global _PROXY_HEADERS_REPORTED
    if _PROXY_HEADERS_REPORTED:
        return
    _PROXY_HEADERS_REPORTED = True
    if declared:
        print("[setup] a request carried forwarding headers but not a usable value where "
              "FSL_CLIENT_IP_HEADER / FSL_TRUSTED_PROXY_HOPS say the client address is, so "
              "the connecting address was taken as the client. If visitors' requests look "
              "like this, the setting does not match the proxy in front of this service and "
              "every visitor shares one sign-in allowance (see docs/OPERATIONS.md, 'Sign-in "
              "protection'; Settings in the console shows the address the service sees).",
              file=sys.stderr)
        return
    print("[setup] a request carried a forwarding header, but neither FSL_CLIENT_IP_HEADER "
          "nor FSL_TRUSTED_PROXY_HOPS is set, so the connecting address was taken as the "
          "client. If a proxy is in front of this service, every visitor shares one sign-in "
          "allowance until one of them is set (see docs/OPERATIONS.md, 'Sign-in protection').",
          file=sys.stderr)


def client_key(address: str) -> str:
    """The key a client is throttled under: its IPv4 address or its IPv6 /64.

    One IPv6 host normally controls a whole /64, so keying on the full address
    would let it use a fresh address for every attempt.
    """
    try:
        ip = ipaddress.ip_address(str(address or ""))
    except ValueError:
        return str(address or "")[:64]
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return f"{ipaddress.IPv6Address(int(ip) >> 64 << 64)}/64"
    return str(ip)


def client_network(address: str) -> str:
    """The wider key sign-in turns are shared out by: the IPv4 address or the
    IPv6 /48.

    A single subscriber is often given a /56 or a /48, which holds hundreds or
    thousands of /64s. Keyed by /64, each of those would count as a separate
    client waiting for a turn.
    """
    try:
        ip = ipaddress.ip_address(str(address or ""))
    except ValueError:
        return str(address or "")[:64]
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return f"{ipaddress.IPv6Address(int(ip) >> 80 << 80)}/48"
    return str(ip)


# --- sign-in throttling ----------------------------------------------------
# Sign-in attempts are counted in a sliding window under three keys: the
# (account, client) pair, the account, and the client (see client_key). The
# table is in-memory, per API process, and starts empty after a restart. Times
# are monotonic-clock readings, so a wall-clock correction cannot stretch or
# cut short a window.
#
# Of these counts, only the pair and client ones ever refuse a request. The
# account count merely lowers the per-client allowance while an account is
# being guessed from many clients. There is deliberately no account-wide lock: on a system with a
# single owner it would be a denial-of-service lever, because anyone who knows
# the owner's email could keep the owner out by failing on purpose. Guessing
# stays bounded per client address and by the cost of each password hash.
LOGIN_WINDOW_SECONDS = 600
LOGIN_LIMITS = {"pair": 8, "ip": 60}
LOGIN_ACCOUNT_PRESSURE = 30
LOGIN_PAIR_LIMIT_UNDER_PRESSURE = 3
# Audit rows written per client and window for sign-ins that did not succeed.
LOGIN_AUDIT_BUDGET = {"failed": 5, "throttled": 1}
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_AUDIT: dict[str, dict] = {}
_LOGIN_LOCK = threading.Lock()
_LOGIN_MAX_KEYS = 20000
# Entries kept under one account key. Only "at least LOGIN_ACCOUNT_PRESSURE"
# is ever asked of it, so the newest few are enough however many clients try.
_LOGIN_ACCOUNT_KEEP = 4 * LOGIN_ACCOUNT_PRESSURE
# Every admitted attempt runs a deliberately slow password hash (two when the
# password has surrounding whitespace), for unknown emails as well. On a small
# instance a few of those at once take all the CPU, and every other request,
# the health check included, waits behind them. So hashes run
# LOGIN_VERIFY_SLOTS at a time and an attempt waits at most
# LOGIN_VERIFY_WAIT_SECONDS for its turn.
#
# Turns are not handed out in order of arrival: a few dozen addresses that
# keep resending would then fill the wait and time everyone else out. The next
# turn goes to the waiting network (see client_network) that has had the
# fewest turns in the current window, earliest first among equals, so someone
# signing in for the first time goes ahead of addresses that have been at it
# all along. A network has one attempt in progress at a time, and at most
# LOGIN_VERIFY_LINE attempts wait: when the line is full, a newcomer takes the
# place of a waiter that has had more turns, or is refused.
LOGIN_VERIFY_SLOTS = 1
LOGIN_VERIFY_WAIT_SECONDS = 10
LOGIN_VERIFY_LINE = 32
# A second attempt from a network (a double tap on Sign in, two people behind
# one address) waits this long for the first to finish; this many may wait.
LOGIN_SAME_NETWORK_WAIT_SECONDS = 3
LOGIN_SAME_NETWORK_WAITERS = 2
# Turns remembered per network. Only "who has had fewer" is asked of it.
_LOGIN_TURNS_KEEP = 240
_LOGIN_TURNS: dict[str, list[float]] = {}
_LOGIN_IN_PROGRESS: set[str] = set()
_LOGIN_QUEUED: dict[str, list[threading.Event]] = {}
_LOGIN_BUSY_REPORTED: float | None = None


class _Waiter:
    __slots__ = ("rank", "seq", "state", "wake")

    def __init__(self, rank: int, seq: int):
        self.rank, self.seq = rank, seq
        self.state = "waiting"          # then "granted" or "dropped"
        self.wake = threading.Event()


class _FairGate:
    """Hands out a fixed number of places: lowest rank first, earliest arrival
    first among equal ranks. Used for password checks (rank: turns a network
    has had) and for guest requests (rank: requests a client has made)."""

    def __init__(self, slots: int, line: int):
        self._lock = threading.Lock()
        self._free = slots
        self._line = line
        self._waiting: list[_Waiter] = []
        self._seq = 0

    def acquire(self, rank: int, timeout: float) -> bool:
        """Wait up to `timeout` seconds for a turn. False means no turn."""
        with self._lock:
            if self._free > 0:          # a free slot means nobody is waiting
                self._free -= 1
                return True
            self._seq += 1
            me = _Waiter(rank, self._seq)
            if len(self._waiting) >= self._line:
                last = max(self._waiting, key=lambda w: (w.rank, w.seq))
                if last.rank <= rank:
                    return False
                self._waiting.remove(last)
                last.state = "dropped"
                last.wake.set()
            self._waiting.append(me)
        me.wake.wait(timeout)
        with self._lock:
            if me.state == "waiting":   # timed out; a grant racing the timeout wins
                self._waiting.remove(me)
                return False
            return me.state == "granted"

    def release(self) -> None:
        with self._lock:
            if self._waiting:
                nxt = min(self._waiting, key=lambda w: (w.rank, w.seq))
                self._waiting.remove(nxt)
                nxt.state = "granted"
                nxt.wake.set()
            else:
                self._free += 1

    def waiting(self) -> int:
        with self._lock:
            return len(self._waiting)


_LOGIN_VERIFY = _FairGate(LOGIN_VERIFY_SLOTS, LOGIN_VERIFY_LINE)


class LoginTicket(NamedTuple):
    """One admitted sign-in attempt: the keys it is counted under, and when."""
    keys: dict
    at: float


def _login_account(email: str) -> str:
    return (email or "").strip().lower()[:254]


def _login_keys(email: str, client: str) -> dict:
    account = _login_account(email)
    return {"pair": f"pair:{account}|{client}", "acct": f"acct:{account}", "ip": f"ip:{client}"}


def _login_trim(table: dict, now: float) -> None:
    """Shrink a table of timestamps to 90% of its cap. The caller holds the lock.

    Expired entries go first. If that is not enough, the keys holding the
    fewest entries go next, least recently used first, so a key that has
    reached its limit outlives any number of one-off keys. A table is never
    emptied: that would unlock every account under attack at once.
    """
    for key in list(table):
        hits = [t for t in table[key] if now - t < LOGIN_WINDOW_SECONDS]
        if hits:
            table[key] = hits
        else:
            del table[key]
    excess = len(table) - (_LOGIN_MAX_KEYS * 9) // 10
    if excess > 0:
        coldest = heapq.nsmallest(excess, table.items(),
                                  key=lambda item: (len(item[1]), item[1][-1]))
        for key, _ in coldest:
            del table[key]


def _login_evict(now: float) -> None:
    _login_trim(_LOGIN_ATTEMPTS, now)


def login_admit(email: str, client: str, now: float | None = None) -> LoginTicket:
    """Admit one sign-in attempt for (email, client key) or raise RateLimitError.

    The limit check and the count are one step under the lock, and the attempt
    is counted before the slow password check runs, so parallel requests cannot
    all pass the check while none of them has been counted yet. A refused
    attempt is not counted.
    """
    now = time.monotonic() if now is None else now
    keys = _login_keys(email, client)
    with _LOGIN_LOCK:
        live = {}
        for kind, key in keys.items():
            hits = [t for t in _LOGIN_ATTEMPTS.get(key, ()) if now - t < LOGIN_WINDOW_SECONDS]
            if hits:
                _LOGIN_ATTEMPTS[key] = hits
            else:
                _LOGIN_ATTEMPTS.pop(key, None)
            live[kind] = hits
        pair_limit = (LOGIN_PAIR_LIMIT_UNDER_PRESSURE
                      if len(live["acct"]) >= LOGIN_ACCOUNT_PRESSURE else LOGIN_LIMITS["pair"])
        for kind, limit in (("pair", pair_limit), ("ip", LOGIN_LIMITS["ip"])):
            hits = live[kind]
            if len(hits) >= limit:
                # This key is back under its limit once this entry expires.
                wait = max(1, math.ceil(hits[len(hits) - limit] + LOGIN_WINDOW_SECONDS - now))
                minutes = math.ceil(wait / 60)
                raise RateLimitError(
                    f"too many sign-in attempts; wait about {minutes} "
                    f"minute{'' if minutes == 1 else 's'} and try again",
                    detail={"retry_after_seconds": wait})
        if len(_LOGIN_ATTEMPTS) > _LOGIN_MAX_KEYS:
            _login_evict(now)
        for key in keys.values():
            _LOGIN_ATTEMPTS.setdefault(key, []).append(now)
        del _LOGIN_ATTEMPTS[keys["acct"]][:-_LOGIN_ACCOUNT_KEEP]
    return LoginTicket(keys, now)


def _login_forget(ticket: LoginTicket, kinds: tuple) -> None:
    """Take a ticket's entry off the given keys. The caller holds the lock."""
    for kind in kinds:
        key = ticket.keys[kind]
        hits = _LOGIN_ATTEMPTS.get(key)
        if not hits:
            continue
        try:
            hits.remove(ticket.at)
        except ValueError:      # already expired or evicted
            pass
        if not hits:
            del _LOGIN_ATTEMPTS[key]


def login_succeeded(ticket: LoginTicket) -> None:
    """A correct password is not a failed attempt: take it off the account and
    client counts and let this client start over on this account."""
    with _LOGIN_LOCK:
        _login_forget(ticket, ("acct", "ip"))
        _LOGIN_ATTEMPTS.pop(ticket.keys["pair"], None)


def login_release(ticket: LoginTicket) -> None:
    """Withdraw an attempt whose password was never judged (it got no turn in
    time, or an internal error stopped it)."""
    with _LOGIN_LOCK:
        _login_forget(ticket, ("pair", "acct", "ip"))


def _login_audit_allowed(client: str, kind: str, now: float | None = None) -> bool:
    """Spend one audit row of `kind` from this client's budget, if any is left.

    Anyone can send failing sign-ins, so each client key gets a fixed number of
    audit rows per window; without that, anonymous requests could grow the
    database without bound.
    """
    now = time.monotonic() if now is None else now
    with _LOGIN_LOCK:
        spent = _LOGIN_AUDIT.get(client)
        if spent is None or now - spent["since"] >= LOGIN_WINDOW_SECONDS:
            if spent is None and len(_LOGIN_AUDIT) >= _LOGIN_MAX_KEYS:
                for key in [k for k, v in _LOGIN_AUDIT.items()
                            if now - v["since"] >= LOGIN_WINDOW_SECONDS]:
                    del _LOGIN_AUDIT[key]
                if len(_LOGIN_AUDIT) >= _LOGIN_MAX_KEYS:
                    return False    # more clients than can be tracked: log no new ones
            spent = _LOGIN_AUDIT[client] = {"since": now, "failed": 0, "throttled": 0}
        if spent[kind] >= LOGIN_AUDIT_BUDGET[kind]:
            return False
        spent[kind] += 1
        return True


def _login_audit(action: str, kind: str, email: str, req: Req) -> None:
    """Record a sign-in that did not succeed, within the client's audit budget.

    The audit log redacts email addresses, so the account is named by a short
    hash that can be compared with the hash of a known address.
    """
    if not _login_audit_allowed(client_key(req.client_ip), kind):
        return
    audit.record(action, actor="anonymous", outcome="denied",
                 detail={"account": util.sha256_text(_login_account(email))[:12],
                         "client": req.client_ip})


def reset_login_throttle_for_tests() -> None:
    global _LOGIN_VERIFY, _LOGIN_BUSY_REPORTED
    with _LOGIN_LOCK:
        _LOGIN_ATTEMPTS.clear()
        _LOGIN_AUDIT.clear()
        _LOGIN_TURNS.clear()
        _LOGIN_IN_PROGRESS.clear()
        _LOGIN_QUEUED.clear()
        _LOGIN_VERIFY = _FairGate(LOGIN_VERIFY_SLOTS, LOGIN_VERIFY_LINE)
        _LOGIN_BUSY_REPORTED = None


def _login_busy() -> RateLimitError:
    """The refusal for an attempt that could not get a turn. It says nothing
    about the password, so it is neither counted against the client nor
    written to the audit log."""
    return RateLimitError("sign-in is busy; wait a few seconds and try again",
                          detail={"retry_after_seconds": LOGIN_VERIFY_WAIT_SECONDS})


def _login_turned_away() -> RateLimitError:
    """_login_busy(), plus one log line per window so the operator can see that
    sign-ins are being refused for lack of a turn."""
    global _LOGIN_BUSY_REPORTED
    now = time.monotonic()
    last = _LOGIN_BUSY_REPORTED
    if last is None or now - last >= LOGIN_WINDOW_SECONDS:
        _LOGIN_BUSY_REPORTED = now
        print("[signin] sign-in attempts are being turned away because password checks are "
              f"busy (reported at most once every {LOGIN_WINDOW_SECONDS // 60} minutes)",
              file=sys.stderr)
    return _login_busy()


def _login_turns(network: str, now: float | None = None) -> int:
    """Turns this network has had in the current window."""
    now = time.monotonic() if now is None else now
    with _LOGIN_LOCK:
        hits = [t for t in _LOGIN_TURNS.get(network, ()) if now - t < LOGIN_WINDOW_SECONDS]
        if hits:
            _LOGIN_TURNS[network] = hits
        else:
            _LOGIN_TURNS.pop(network, None)
        return len(hits)


def _login_turn_taken(network: str, now: float | None = None) -> None:
    now = time.monotonic() if now is None else now
    with _LOGIN_LOCK:
        if network not in _LOGIN_TURNS and len(_LOGIN_TURNS) >= _LOGIN_MAX_KEYS:
            _login_trim(_LOGIN_TURNS, now)
        hits = _LOGIN_TURNS.setdefault(network, [])
        hits.append(now)
        del hits[:-_LOGIN_TURNS_KEEP]


def _login_enter(network: str) -> None:
    """Take this network's one place in sign-in, waiting briefly if it is taken."""
    with _LOGIN_LOCK:
        if network not in _LOGIN_IN_PROGRESS:
            _LOGIN_IN_PROGRESS.add(network)
            return
        queue = _LOGIN_QUEUED.get(network, [])
        if len(queue) >= LOGIN_SAME_NETWORK_WAITERS:
            raise _login_turned_away()
        mine = threading.Event()
        queue.append(mine)
        _LOGIN_QUEUED[network] = queue
    mine.wait(LOGIN_SAME_NETWORK_WAIT_SECONDS)
    with _LOGIN_LOCK:
        if mine.is_set():               # the attempt before this one handed its place over
            return
        queue = _LOGIN_QUEUED[network]
        queue.remove(mine)
        if not queue:
            del _LOGIN_QUEUED[network]
    raise _login_turned_away()


def _login_leave(network: str) -> None:
    with _LOGIN_LOCK:
        queue = _LOGIN_QUEUED.get(network)
        if queue:
            # The place goes straight to the next attempt from this network.
            queue.pop(0).set()
            if not queue:
                del _LOGIN_QUEUED[network]
        else:
            _LOGIN_IN_PROGRESS.discard(network)


# --- guest (public read-only view) throttling --------------------------------
# Every request served to a guest is counted twice, both in fixed one-minute
# windows: per client (GUEST_LIMIT_PER_MINUTE) and across all guests
# (GUEST_GLOBAL_LIMIT_PER_MINUTE). Beyond either limit the answer is HTTP 429.
# In-memory, per API process; signed-in requests are never counted. A client
# is keyed like the sign-in throttle: client_key() of the address the request
# was resolved to (see resolve_client).
#
# The per-client table holds at most GUEST_MAX_CLIENTS addresses. When it is
# full, expired windows are dropped and, if that is not enough, the clients
# with the oldest window start are forgotten, so a flood of new addresses
# cannot lock other visitors out. Forgetting a client resets its count, which
# is why the global ceiling exists: it bounds total guest load no matter how
# many addresses the requests appear to come from. A client only enters the
# table after passing the ceiling, so at most two ceilings' worth of client
# windows are live at any moment and dropping the expired ones makes room.
GUEST_WINDOW_SECONDS = 60
# Sized for the smallest host this runs on (a tenth of a CPU). Measured there,
# the heaviest guest route (the JSON report) costs about 15 ms of CPU, so about
# seven requests a second use all of it. The ceiling admits four a second,
# which leaves room for the health check and for people who sign in. A larger
# host can raise the ceiling with FSL_GUEST_REQUESTS_PER_MINUTE.
GUEST_LIMIT_PER_MINUTE = 90
GUEST_GLOBAL_LIMIT_PER_MINUTE = 240
# Once this share of the ceiling is used, only clients with fewer than
# GUEST_NEWCOMER_REQUESTS requests in the window are still admitted.
GUEST_OPEN_SHARE = 0.6
GUEST_NEWCOMER_REQUESTS = 12
GUEST_MAX_CLIENTS = 4096
# A limit per minute does not stop a burst, and a thread per connection lets a
# burst pile up until nothing is answered, long after the burst is over. So
# guest requests are also worked on GUEST_SLOTS at a time. Up to GUEST_LINE
# more wait, at most GUEST_WAIT_SECONDS, the client that has asked for the
# least this minute first; anyone past that is refused at once. People who
# are signed in, and the health check, never wait behind guests.
GUEST_SLOTS = 2
GUEST_LINE = 16
GUEST_WAIT_SECONDS = 4
_GUEST_WORK = _FairGate(GUEST_SLOTS, GUEST_LINE)
_GUEST_HITS: dict[str, list] = {}       # client -> [window_start, count]
_GUEST_GLOBAL: list = [0.0, 0]          # [window_start, count] for all guests together
_GUEST_LOCK = threading.Lock()


def _guest_make_room(now: float) -> None:
    """Free at least one slot in the full per-client table (lock held)."""
    for key in [k for k, v in _GUEST_HITS.items() if now - v[0] >= GUEST_WINDOW_SECONDS]:
        del _GUEST_HITS[key]
    excess = len(_GUEST_HITS) - GUEST_MAX_CLIENTS + 1
    if excess > 0:
        # Evict a batch, oldest window first, so a burst of new addresses does
        # not sort the whole table again on every request.
        batch = max(excess, GUEST_MAX_CLIENTS // 8)
        for key in sorted(_GUEST_HITS, key=lambda k: _GUEST_HITS[k][0])[:batch]:
            del _GUEST_HITS[key]


def _guest_busy() -> RateLimitError:
    return RateLimitError("the public view is busy; try again in a minute")


def guest_rate_check(client: str, now: float | None = None) -> int:
    """Count one guest request for this client; raise RateLimitError if over.
    Returns how many requests the client has made in the current window.

    Only a request that is let through counts toward the global ceiling, so a
    single client hammering past its own limit cannot use the ceiling up."""
    now = time.time() if now is None else now
    client = (client or "unknown")[:64]
    with _GUEST_LOCK:
        if now - _GUEST_GLOBAL[0] >= GUEST_WINDOW_SECONDS:
            _GUEST_GLOBAL[:] = [now, 0]
        ceiling = get_config().guest_requests_per_minute or GUEST_GLOBAL_LIMIT_PER_MINUTE
        if _GUEST_GLOBAL[1] >= ceiling:
            raise _guest_busy()
        entry = _GUEST_HITS.get(client)
        if entry is None or now - entry[0] >= GUEST_WINDOW_SECONDS:
            if entry is None and len(_GUEST_HITS) >= GUEST_MAX_CLIENTS:
                _guest_make_room(now)
            entry = _GUEST_HITS[client] = [now, 0]
        if entry[1] >= GUEST_LIMIT_PER_MINUTE:
            raise RateLimitError("rate limit exceeded; slow down or sign in")
        if (entry[1] >= GUEST_NEWCOMER_REQUESTS
                and _GUEST_GLOBAL[1] >= int(ceiling * GUEST_OPEN_SHARE)):
            # The last part of the ceiling is kept for clients that have asked
            # for little this minute, so a few busy addresses cannot use it all
            # up and close the view for someone who has just arrived.
            raise _guest_busy()
        entry[1] += 1
        _GUEST_GLOBAL[1] += 1
        return entry[1]


@route("POST", r"/api/auth/login", auth_required=False)
def login(req: Req):
    email = str(req.body.get("email", ""))
    client = client_key(req.client_ip)
    network = client_network(req.client_ip)
    # Refused or made to wait here, an attempt has not been counted yet.
    _login_enter(network)
    try:
        return _login_attempt(email, client, network, req)
    finally:
        _login_leave(network)


def _login_attempt(email: str, client: str, network: str, req: Req):
    try:
        ticket = login_admit(email, client)
    except RateLimitError:
        _login_audit("auth.login_throttled", "throttled", email, req)
        raise
    gate = _LOGIN_VERIFY
    try:
        if not gate.acquire(_login_turns(network), LOGIN_VERIFY_WAIT_SECONDS):
            raise _login_turned_away()
        try:
            _login_turn_taken(network)
            out = auth.login(email, str(req.body.get("password", "")))
        finally:
            gate.release()
    except AuthError:
        # The admitted attempt stays counted: it is the record of this failure.
        _login_audit("auth.login_failed", "failed", email, req)
        raise
    except BaseException:
        # The password was never judged (no turn in time, or an internal error).
        login_release(ticket)
        raise
    login_succeeded(ticket)
    # A correct password is not a guess: this network waits like a newcomer again.
    with _LOGIN_LOCK:
        _LOGIN_TURNS.pop(network, None)
    audit.record("auth.login", actor=out["user"]["email"], detail={"ok": True})
    return 200, out


@route("POST", r"/api/auth/logout")
def logout(req: Req):
    if req.token:
        auth.logout(req.token)   # invalidate the session server-side
    return 200, {"ok": True}


@route("GET", r"/api/me", guest_ok=True)
def me(req: Req):
    user = {"id": req.principal.user_id, "email": req.principal.email,
            "global_role": req.principal.global_role}
    if req.principal.guest:
        user["guest"] = True
        return 200, {"user": user}
    out = {"user": user,
           # How this server identified the caller, so an operator can check
           # that the proxy settings match the hosting setup.
           "client": {"address": req.client_ip, "source": req.client_source,
                      "proxy_headers_ignored": req.proxy_headers_ignored}}
    if req.principal.global_role in ("owner", "admin"):
        out["setup_notices"] = list(ADMIN_NOTICES)
    return 200, out


@route("GET", r"/api/health", auth_required=False)
def health(req: Req):
    return 200, {"ok": True, "platform": "faisal-security-lab", "time": util.now_iso()}


@route("GET", r"/api/config", auth_required=False)
def config_public(req: Req):
    cfg = get_config()
    # setup_notices are stable codes for startup problems (never secrets); the
    # sign-in page turns them into an explanation of what the operator must fix.
    # Codes that describe the host itself are left out here (see /api/me).
    return 200, {"environment": cfg.environment, "ai_available": cfg.ai.available,
                 "brand": "FAISAL.AI", "setup_notices": list(SETUP_NOTICES),
                 "min_password_length": auth.MIN_PASSWORD_LENGTH,
                 "public_view": cfg.public_view}


# ===========================================================================
# Users (global admin)
# ===========================================================================
@route("GET", r"/api/users", min_global="admin")
def users_list(req: Req):
    return 200, {"users": auth.list_users()}


@route("POST", r"/api/users", min_global="admin")
def users_create(req: Req):
    u = auth.create_user(req.body.get("email", ""), req.body.get("password", ""),
                         display_name=req.body.get("display_name", ""),
                         global_role=req.body.get("global_role", "reader"))
    audit.record("user.create", actor=req.principal.email, actor_role=req.principal.global_role,
                 target=u["id"], detail={"role": u["global_role"]})
    return 201, {"user": u}


# ===========================================================================
# Projects / assets / scopes
# ===========================================================================
@route("GET", r"/api/projects", guest_ok=True)
def projects_list(req: Req):
    pid = auth.public_project_id()
    try:
        public = [store.get_project(pid)] if pid else []
    except NotFoundError:
        public = []
    if req.principal.guest:
        # A guest sees the public demo project and nothing else (an empty list
        # until it exists). Never falls through to the membership query.
        return 200, {"projects": public}
    projects = store.list_projects_for(req.principal.user_id, req.principal.global_role)
    # While the public view is on, signing in never hides the demo project:
    # every account is at least a reader of it (auth.Principal.project_role).
    listed = {p["id"] for p in projects}
    return 200, {"projects": projects + [p for p in public if p["id"] not in listed]}


@route("POST", r"/api/projects")
def projects_create(req: Req):
    p = store.create_project(req.body.get("name", ""), req.principal.user_id)
    audit.record("project.create", actor=req.principal.email, project_id=p["id"],
                 detail={"name": p["name"]})
    return 201, {"project": p}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)", guest_ok=True)
def project_get(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"project": store.get_project(pid),
                 "metrics": metrics.snapshot(pid)}


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/members", min_global=None)
def project_add_member(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "admin")
    store.add_member(pid, req.body["user_id"], req.body.get("role", "reader"))
    audit.record("project.add_member", actor=req.principal.email, project_id=pid,
                 detail={"user_id": req.body["user_id"], "role": req.body.get("role")})
    return 200, {"ok": True}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)/assets", guest_ok=True)
def assets_list(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"assets": store.list_assets(pid)}


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/assets")
def assets_create(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "analyst")
    metadata = req.body.get("metadata")
    if metadata is None:
        metadata = {}           # "metadata": null means the same as leaving it out
    if not isinstance(metadata, dict):
        raise ValidationError("metadata must be an object")
    if metadata.get("internal"):
        # An asset marked internal may be reached on private addresses. That
        # lifts a guard, so it takes the role that grants authorization.
        req.principal.require_project(pid, "admin")
    a = store.create_asset(pid, req.body.get("kind", ""), req.body.get("identifier", ""),
                           label=req.body.get("label", ""),
                           criticality=req.body.get("criticality", "medium"),
                           metadata=metadata,
                           created_by=req.principal.user_id)
    audit.record("asset.create", actor=req.principal.email, project_id=pid, target=a["id"],
                 detail={"kind": a["kind"]})
    return 201, {"asset": a}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)/scopes", guest_ok=True)
def scopes_list(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"scopes": store.list_scopes(pid, req.q("asset_id"))}


def _scope_list(value, name: str, *, numbers: bool = False) -> list:
    """A list of short strings (or port numbers), as the policy engine reads it."""
    if value is None:
        return []
    kinds = (str, int) if numbers else (str,)
    if (not isinstance(value, list) or len(value) > 200
            or any(isinstance(item, bool) or not isinstance(item, kinds)
                   or len(str(item)) > 2048 for item in value)):
        raise ValidationError(f"{name} must be a list of " + ("ports" if numbers else "strings"))
    return value


def _scope_map(value, name: str) -> dict:
    if value is None:
        return {}
    if not isinstance(value, dict) or len(json.dumps(value)) > 4096:
        raise ValidationError(f"{name} must be an object")
    return value


def _scope_time(value, name: str) -> str | None:
    """An ISO date-time, stored in UTC in the form the policy engine compares."""
    if value is None or value == "":
        return None
    try:
        if not isinstance(value, str):
            raise ValueError
        moment = datetime.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise ValidationError(f"{name} must be an ISO date and time") from None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=datetime.timezone.utc)
    return moment.astimezone(datetime.timezone.utc).replace(microsecond=0).isoformat()


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/scopes")
def scopes_create(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "admin")  # only admins grant authorization
    b = req.body
    # A scope authorizes connectors by name (the policy engine compares names),
    # so nothing else is stored there.
    scan_types = b.get("scan_types", [])
    known = set(connector_names())
    if (not isinstance(scan_types, list) or len(scan_types) > len(known)
            or any(not isinstance(name, str) or name not in known for name in scan_types)):
        raise ValidationError("scan_types must be a list of connector names")
    # The policy engine reads the other fields as lists, dates and maps; a
    # value of another shape would fail there, at scan time.
    window = _scope_map(b.get("window"), "window")
    for hour in ("start_hour_utc", "end_hour_utc"):
        if window.get(hour) is not None and (isinstance(window[hour], bool)
                                             or not isinstance(window[hour], int)
                                             or not 0 <= window[hour] <= 23):
            raise ValidationError(f"window.{hour} must be an hour from 0 to 23")
    s = store.create_scope(pid, b["asset_id"], owner_contact=b.get("owner_contact", ""),
                           proof=b.get("proof", ""), environment=b.get("environment", "lab"),
                           allowed_targets=_scope_list(b.get("allowed_targets"), "allowed_targets"),
                           denied_targets=_scope_list(b.get("denied_targets"), "denied_targets"),
                           allowed_ports=_scope_list(b.get("allowed_ports"), "allowed_ports",
                                                     numbers=True),
                           scan_types=scan_types,
                           valid_from=_scope_time(b.get("valid_from"), "valid_from"),
                           valid_until=_scope_time(b.get("valid_until"), "valid_until"),
                           window=window, rate_limits=_scope_map(b.get("rate_limits"), "rate_limits"),
                           created_by=req.principal.user_id)
    audit.record("scope.create", actor=req.principal.email, project_id=pid, target=s["id"],
                 detail={"environment": s["environment"], "scan_types": s["scan_types"],
                         "allowed_targets": s["allowed_targets"]})
    return 201, {"scope": s}


@route("POST", r"/api/scopes/(?P<sid>[\w-]+)/revoke")
def scope_revoke(req: Req):
    s = store.get_scope(req.params["sid"])
    req.principal.require_project(s["project_id"], "admin")
    out = store.revoke_scope(s["id"])
    audit.record("scope.revoke", actor=req.principal.email, project_id=s["project_id"],
                 target=s["id"])
    return 200, {"scope": out}


# ===========================================================================
# Catalog + tool registry + connectors
# ===========================================================================
@route("GET", r"/api/catalog", guest_ok=True)
def catalog(req: Req):
    return 200, {"categories": store.catalog_categories(),
                 "tools": store.list_catalog(req.q("category"))}


@route("GET", r"/api/tools", guest_ok=True)
def tools(req: Req):
    return 200, {"tools": store.list_tool_registry()}


@route("POST", r"/api/tools/sync", min_global="admin")
def tools_sync(req: Req):
    out = sync_registry()
    audit.record("tools.sync", actor=req.principal.email, detail={"count": len(out)})
    return 200, {"synced": out}


# Probing readiness runs every tool's version command, which takes seconds on a
# laptop and minutes on a small instance. The listing is therefore read from
# the stored tool registry (filled by the startup sync and by an admin's
# POST /api/tools/sync). A signed-in caller can ask for a fresh probe with
# ?live=1; a guest never starts a process on the server.
def _connectors_live() -> list:
    out = []
    for c in all_connectors():
        try:
            r = c.readiness()
        except Exception as e:
            r = {"available": False, "detail": str(e)}
        out.append({"name": c.name, "category": c.category, "source": c.source,
                    "license": c.license, "connector_type": c.connector_type,
                    "capabilities": c.capabilities(), "readiness": r})
    return out


def _connectors_from_registry() -> list:
    """The listing in the shape of _connectors_live, read from the tool
    registry table (written by the startup sync) without probing anything.
    Each entry also carries the registry "state". Empty until the first sync
    has finished."""
    out = []
    for row in store.list_tool_registry():
        conn = get_connector(row["name"])
        out.append({"name": row["name"], "category": row["category"], "source": row["source"],
                    "license": row["license"], "connector_type": row["connector_type"],
                    "capabilities": conn.capabilities() if conn else {},
                    "readiness": row["readiness"], "state": row["state"]})
    return out


def _connectors_pending() -> list:
    """The listing for a signed-in caller before the first registry sync has
    finished: what the code knows about each connector, nothing probed."""
    return [{"name": c.name, "category": c.category, "source": c.source,
             "license": c.license, "connector_type": c.connector_type,
             "capabilities": c.capabilities(),
             "readiness": {"available": False, "detail": "tools are still being checked"},
             "state": "checking"} for c in all_connectors()]


@route("GET", r"/api/connectors", guest_ok=True)
def connectors(req: Req):
    if req.principal.guest:
        return 200, {"connectors": _connectors_from_registry()}
    if req.q("live") == "1":
        return 200, {"connectors": _connectors_live()}
    # While the first sync is still running, a connector without a registry
    # row yet is listed as "checking" rather than left out.
    rows = {entry["name"]: entry for entry in _connectors_from_registry()}
    listing = [rows.pop(entry["name"], entry) for entry in _connectors_pending()]
    return 200, {"connectors": listing + list(rows.values())}


# ===========================================================================
# Scans (jobs)
# ===========================================================================
@route("POST", r"/api/projects/(?P<pid>[\w-]+)/scans")
def scan_enqueue(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "analyst")
    _rate_check(pid)
    b = req.body
    project = store.get_project(pid)
    asset = store.get_asset(b["asset_id"])
    scope = store.get_scope(b["scope_id"])
    conn = get_connector(b.get("connector", ""))
    if conn is None:
        raise ValidationError(f"unknown connector '{b.get('connector')}'")
    params = conn.validate_config(b.get("params", {}))
    # POLICY AT ENQUEUE — an out-of-scope request is rejected even here.
    decision = policy.evaluate_job(principal=req.principal, project=project, asset=asset,
                                   scope=scope, connector=conn, params=params)
    if not decision.allow:
        # The refusal names what was refused and what the scope allows, in the
        # answer and in the audit record alike.
        audit.record("scan.denied", actor=req.principal.email, project_id=pid,
                     target=b.get("connector"), outcome="denied",
                     detail={"reason": decision.reason, "code": decision.code,
                             **decision.detail})
        raise ForbiddenError(decision.reason, code="policy_denied",
                             detail=decision.public_detail())
    job = queue.enqueue(project_id=pid, asset_id=asset["id"], scope_id=scope["id"],
                        connector=conn.name, params=params, created_by=req.principal.user_id,
                        priority=int(b.get("priority", 5)),
                        idempotency_key=b.get("idempotency_key"))
    if job["project_id"] != pid:
        # The queue matches an idempotency key across projects. A key that a
        # job of another project holds is refused; that job is not handed out.
        raise ConflictError("idempotency key is already in use")
    audit.record("scan.enqueue", actor=req.principal.email, project_id=pid, target=job["id"],
                 detail={"connector": conn.name, "asset": asset["id"]})
    return 201, {"job": job}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)/jobs", guest_ok=True)
def jobs_list(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"jobs": queue.list_jobs(pid, state=req.q("state"))}


def _require_reader(req: Req, project_id: str, missing: str) -> None:
    """Reader access to the project an object belongs to. A guest who lacks it
    is told the object does not exist, the same answer as for an id that was
    never issued."""
    try:
        req.principal.require_project(project_id, "reader")
    except ForbiddenError:
        if req.principal.guest:
            raise NotFoundError(missing) from None
        raise


@route("GET", r"/api/jobs/(?P<jid>[\w-]+)", guest_ok=True)
def job_get(req: Req):
    job = queue.get_job(req.params["jid"])
    _require_reader(req, job["project_id"], "job not found")
    return 200, {"job": job, "evidence": evidence.list_for_job(job["id"])}


@route("POST", r"/api/jobs/(?P<jid>[\w-]+)/stop")
def job_stop(req: Req):
    job = queue.get_job(req.params["jid"])
    req.principal.require_project(job["project_id"], "analyst")
    out = queue.request_stop(job["id"])
    audit.record("job.stop", actor=req.principal.email, project_id=job["project_id"], target=job["id"])
    return 200, {"job": out}


# ===========================================================================
# Findings
# ===========================================================================
@route("GET", r"/api/projects/(?P<pid>[\w-]+)/findings", guest_ok=True)
def findings_list(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"findings": F.list_findings(pid, severity=req.q("severity"),
                                             status=req.q("status"), connector=req.q("connector"))}


@route("GET", r"/api/findings/(?P<fid>[\w-]+)", guest_ok=True)
def finding_get(req: Req):
    f = F.get_finding(req.params["fid"])
    _require_reader(req, f["project_id"], "finding not found")
    return 200, {"finding": f, "evidence": evidence.list_for_finding(f["id"])}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/status")
def finding_status(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    out = F.set_status(f["id"], req.body.get("status", ""), actor=req.principal.email,
                       actor_role=req.principal.global_role, note=req.body.get("note", ""))
    return 200, {"finding": out}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/verification")
def finding_verify(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    out = F.set_verification(f["id"], req.body.get("verification", ""), actor=req.principal.email,
                             evidence_note=req.body.get("note", ""))
    return 200, {"finding": out}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/triage")
def finding_triage(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    return 200, {"triage": agents.triage(f)}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/remediation")
def finding_remediation(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    return 200, {"remediation": agents.remediation(f)}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/validate")
def finding_validate(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    # Deterministic signal: did the same dedup_key reappear in a newer job?
    reappeared = f["status"] == "reopened"
    return 200, {"validation": agents.validation(f, reappeared)}


# ===========================================================================
# Evidence
# ===========================================================================
@route("GET", r"/api/evidence/(?P<eid>[\w-]+)")
def evidence_read(req: Req):
    out = evidence.read_text(req.params["eid"])
    req.principal.require_project(out["meta"]["project_id"], "analyst")
    audit.record("evidence.read", actor=req.principal.email,
                 project_id=out["meta"]["project_id"], target=req.params["eid"])
    return 200, out


# ===========================================================================
# Reports
# ===========================================================================
REPORT_FORMATS = ("json", "sarif", "md", "html")
REPORT_LANGS = ("ar", "en")


@route("GET", r"/api/projects/(?P<pid>[\w-]+)/report", guest_ok=True)
def report(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    # Both parameters are reduced to known values. The language ends up in the
    # markup of the HTML report, so nothing a caller typed may pass through.
    fmt = req.q("format", "json")
    if fmt not in REPORT_FORMATS:
        fmt = "json"
    lang = req.q("lang", "ar")
    if lang not in REPORT_LANGS:
        lang = "ar"
    if fmt == "sarif":
        return 200, ("application/json", reports.to_sarif(pid))
    if fmt == "md":
        return 200, ("text/markdown; charset=utf-8", reports.to_markdown(pid, lang))
    if fmt == "html":
        return 200, ("text/html; charset=utf-8", reports.to_html(pid, lang))
    return 200, json.loads(reports.to_json(pid))


# ===========================================================================
# AI
# ===========================================================================
@route("GET", r"/api/ai/status", guest_ok=True)
def ai_status(req: Req):
    cfg = get_config()
    return 200, {"available": cfg.ai.available, "provider": cfg.ai.provider,
                 "model": cfg.ai.model}


@route("GET", r"/api/ai/evalset")
def ai_evalset(req: Req):
    return 200, evalset.run()


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/ai/plan")
def ai_plan(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "analyst")
    assets = store.list_assets(pid)
    from .connectors import connector_names
    return 200, {"plan": agents.planner(assets, connector_names())}


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/ai/report")
def ai_report(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    m = metrics.snapshot(pid)
    top = F.list_findings(pid, limit=15)
    return 200, {"report": agents.reporting(m, top)}


# ===========================================================================
# Red/Blue teams, the training lab, and the attack/defence simulation.
# All of this runs only on built-in, make-believe material: the lab solves
# bundled ciphers and the simulation plays out on a virtual network. None of it
# touches a real target, so these are safe read-only (GET) routes open to the
# public view. They compute on demand and write nothing.
# ===========================================================================
def _q_int(value, default, lo, hi):
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def _q_float(value, default, lo, hi):
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


@route("GET", r"/api/teams", guest_ok=True)
def teams_meta(req: Req):
    return 200, {"teams": teams.team_meta()}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)/teams", guest_ok=True)
def teams_summary(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    rows = [{"connector": f.get("connector", ""), "severity": f.get("severity", "info")}
            for f in F.list_findings(pid)]
    return 200, {"teams": teams.team_meta(), "summary": teams.summarize_by_team(rows)}


@route("GET", r"/api/lab/challenges", guest_ok=True)
def lab_challenges(req: Req):
    return 200, {"challenges": lab.list_challenges()}


@route("GET", r"/api/lab/solve", guest_ok=True)
def lab_solve(req: Req):
    return 200, lab.solve(req.q("id") or "")


@route("GET", r"/api/lab/grade", guest_ok=True)
def lab_grade(req: Req):
    return 200, lab.grade_attempt(req.q("id") or "", req.q("answer") or "")


@route("GET", r"/api/sim/scenarios", guest_ok=True)
def sim_scenarios(req: Req):
    return 200, {"scenarios": sim.scenario_catalog()}


# The crypto auto-cracker: analyse caller-supplied text (a cipher or encoded
# blob) with the standard-library engine. Pure computation on the given text —
# no target, no network. Bounded input so a guest cannot ask for heavy work.
@route("GET", r"/api/crypto/analyze", guest_ok=True)
def crypto_analyze(req: Req):
    text = (req.q("text") or "")[:2000]
    if not text.strip():
        return 200, {"best": {"method": "", "text": "", "key": "", "score": 0},
                     "readable": False, "candidates": [], "steps": []}
    return 200, crypto.deep_analyze(text)


@route("GET", r"/api/sim/run", guest_ok=True)
def sim_run(req: Req):
    scenario = req.q("scenario") or "corp"
    out = sim.run(scenario,
                  seed=_q_int(req.q("seed"), 1, 0, 100000),
                  detection=_q_float(req.q("detection"), 0.5, 0.0, 1.0),
                  max_turns=_q_int(req.q("max_turns"), 24, 1, 60))
    status = 404 if out.get("error") else 200
    return status, out


# ===========================================================================
# Audit + admin
# ===========================================================================
@route("GET", r"/api/audit")
def audit_list(req: Req):
    pid = req.q("project")
    if pid:
        req.principal.require_project(pid, "admin")
    else:
        req.principal.require_global("admin")
    return 200, {"audit": audit.query(pid, limit=int(req.q("limit", "200")))}


@route("GET", r"/api/admin/stop")
def admin_stop_get(req: Req):
    req.principal.require_global("admin")
    return 200, {"engaged": policy.global_stop_engaged()}


@route("POST", r"/api/admin/stop", min_global="admin")
def admin_stop_set(req: Req):
    engaged = bool(req.body.get("engaged", True))
    policy.set_global_stop(engaged)
    audit.record("admin.global_stop", actor=req.principal.email,
                 detail={"engaged": engaged}, outcome="ok")
    return 200, {"engaged": engaged}


@route("GET", r"/api/metrics", guest_ok=True)
def metrics_global(req: Req):
    # Guest-readable only with ?project=<the public project>: platform-wide
    # metrics need a global role, which a guest never has.
    pid = req.q("project")
    if pid:
        req.principal.require_project(pid, "reader")
    else:
        req.principal.require_global("reader")
    return 200, metrics.snapshot(pid)


# ===========================================================================
# HTTP handler
# ===========================================================================
def _rate_check(key: str, limit_per_min: int | None = None):
    limit = limit_per_min or get_config().limits.rate_limit_jobs_per_minute
    now = time.time()
    with _RATE_LOCK:
        bucket = _RATE.setdefault(key, [])
        bucket[:] = [t for t in bucket if now - t < 60]
        if len(bucket) >= limit:
            from .errors import RateLimitError
            raise RateLimitError("rate limit exceeded; slow down")
        bucket.append(now)


# Limits on what is accepted before the sender is known.
MAX_TARGET_BYTES = 2048             # request path and query string together
MAX_QUERY_FIELDS = 32
MAX_ANONYMOUS_BODY_BYTES = 16 * 1024
MAX_DISCARDED_BODY_BYTES = 64 * 1024  # an unwanted body up to this size is read and dropped


class Handler(BaseHTTPRequestHandler):
    server_version = "faisal-security-lab/2.0"
    protocol_version = "HTTP/1.1"
    _head_only = False
    _body_pending = False

    def log_message(self, fmt, *args):  # quiet by default
        pass

    def _security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                         "script-src 'self'; connect-src 'self'; img-src 'self' data:; "
                         "base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
        self.send_header("Cache-Control", "no-store")

    def _send_json(self, status, obj):
        if isinstance(obj, tuple):  # (content_type, raw_text)
            ctype, raw = obj
            data = raw.encode("utf-8")
        else:
            ctype = "application/json; charset=utf-8"
            data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        if self._body_pending:
            self._discard_body()
        try:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            if self.close_connection:
                self.send_header("Connection", "close")
            self._security_headers()
            self.end_headers()
            if not self._head_only:
                self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            # The client went away before the answer; nothing to report.
            self.close_connection = True

    def _client(self) -> tuple[str, str, bool]:
        """(address, source, proxy_headers_ignored) for this request."""
        peer = self.client_address[0] if self.client_address else ""
        address, source = resolve_client(self.headers, peer)
        ignored = source == "peer" and any(self.headers.get(h) is not None
                                           for h in _PROXY_HEADERS)
        if ignored:
            cfg = get_config()
            _report_ignored_proxy_headers(bool(cfg.client_ip_header or cfg.trusted_proxy_hops))
        return address, source, ignored

    def _credentials(self) -> list[str]:
        """Every non-blank Authorization header line of the request."""
        return [line.strip() for line in self.headers.get_all("Authorization") or []
                if line.strip()]

    def _token(self):
        # The first credential that was presented is the one that is checked,
        # whichever header line it is on.
        for line in self._credentials():
            return line[7:].strip() if line.startswith("Bearer ") else None
        return None

    def _guest_allowed(self, method: str, guest_ok: bool) -> bool:
        """True when this request is served as the read-only guest.

        All four must hold: the public view is switched on, the route is on the
        guest allowlist, the method is GET, and the request carries no
        Authorization header at all. Presenting any credential (even a
        malformed, unknown or expired one) opts out, so it is validated and
        rejected with 401 like before rather than silently downgraded."""
        if not guest_ok or method != "GET":
            return False
        if self._credentials():
            return False
        if self.headers.defects:
            # The header parser stopped at a line it could not read; a
            # credential may be behind it, so this is not treated as "none".
            return False
        return get_config().public_view

    def _read_body(self, limit: int | None = None):
        if self.headers.get("Transfer-Encoding") is not None:
            raise ValidationError("send the request body with a Content-Length")
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            raise ValidationError("invalid Content-Length")
        if length <= 0:
            self._body_pending = False
            return {}
        if length > (limit or get_config().limits.max_request_bytes):
            raise ValidationError("request body too large")
        raw = self.rfile.read(length)
        self._body_pending = False
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError:
            raise ValidationError("invalid JSON body")

    def _discard_body(self) -> None:
        """Deal with a request body that was not read (the caller was refused
        before it was wanted). Left in place it would be taken for the next
        request on this connection. A small one is read and thrown away,
        unparsed; past that the connection is closed after the answer."""
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            length = -1
        if self.headers.get("Transfer-Encoding") is not None:
            length = -1
        if 0 <= length <= MAX_DISCARDED_BODY_BYTES:
            try:
                self.rfile.read(length)
            except OSError:
                self.close_connection = True
        else:
            self.close_connection = True
        self._body_pending = False

    def _dispatch(self, method):
        # Splitting and parsing a request target costs CPU before anything is
        # known about the sender, and it grows with the length. No route of
        # this API needs more than a short path and a few parameters.
        if len(self.path) > MAX_TARGET_BYTES:
            self.close_connection = True
            return self._send_json(414, {"error": {"code": "uri_too_long",
                                                   "message": "request target too long"}})
        parsed = urlsplit(self.path)
        path = parsed.path

        # Static UI for non-/api GET.
        if method == "GET" and not path.startswith("/api/"):
            return self._serve_static(path)

        has_body = method in ("POST", "PUT", "PATCH")
        for m, rx, fn, auth_required, min_global, guest_ok in _ROUTES:
            if m != method:
                continue
            match = rx.match(path)
            if not match:
                continue
            principal = None
            gate, guest_slot = None, False
            try:
                try:
                    try:
                        query = parse_qs(parsed.query, max_num_fields=MAX_QUERY_FIELDS)
                    except ValueError:
                        raise ValidationError("too many query parameters")
                    tok = self._token()
                    address, source, ignored = self._client()
                    if auth_required or min_global:
                        if self._guest_allowed(method, guest_ok):
                            # Guests are limited by the same client key as
                            # sign-in (IPv4 address or IPv6 /64).
                            asked = guest_rate_check(client_key(address))
                            principal = auth.guest_principal()
                            gate = _GUEST_WORK
                            guest_slot = gate.acquire(asked, GUEST_WAIT_SECONDS)
                            if not guest_slot:
                                raise _guest_busy()
                        else:
                            principal = auth.principal_from_token(tok)
                            if min_global:
                                principal.require_global(min_global)
                    # The body is read once the caller is known. A caller who
                    # has not signed in (the sign-in route itself) may send a
                    # small one only.
                    body = {}
                    if has_body:
                        body = self._read_body(None if principal is not None
                                               else MAX_ANONYMOUS_BODY_BYTES)
                    req = Req(principal, match.groupdict(), query, body, token=tok,
                              client_ip=address, client_source=source,
                              proxy_headers_ignored=ignored)
                    status, obj = fn(req)
                except AppError as e:
                    status, obj = e.status, e.public()
                except Exception as e:  # unexpected
                    status, obj = 500, {"error": {"code": "internal", "message": str(e)[:200]}}
                if principal is not None and principal.guest:
                    # The one place the guest view is applied: results and errors
                    # of every guest_ok route, JSON and report text alike.
                    obj = guest_view.apply(obj)
            finally:
                # Whatever happened above, the place is given back, and before
                # the response is written: a slow reader must not hold one.
                if guest_slot:
                    gate.release()
            return self._send_json(status, obj)
        return self._send_json(404, {"error": {"code": "not_found", "message": "no such route"}})

    def _begin(self, head_only: bool) -> None:
        """Note whether this request carries a body. Whatever the answer turns
        out to be, a body that nobody read must not be left on the connection:
        it would be taken for the next request."""
        self._head_only = head_only
        self._body_pending = False
        if self.headers.get("Transfer-Encoding") is not None:
            # A body without a stated length is not read by this server at all.
            self._body_pending = True
            self.close_connection = True
            return
        length = self.headers.get("Content-Length")
        if length is not None and length.strip() not in ("", "0"):
            self._body_pending = True

    def do_GET(self):
        self._begin(False)
        self._dispatch("GET")

    def do_HEAD(self):
        # Same as GET without the body (uptime monitors commonly use HEAD).
        self._begin(True)
        self._dispatch("GET")

    def do_POST(self):
        self._begin(False)
        self._dispatch("POST")

    def _serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        # Prevent traversal.
        rel = path.lstrip("/")
        target = (WEB_DIR / rel).resolve()
        if not str(target).startswith(str(WEB_DIR.resolve())) or not target.is_file():
            # SPA fallback to index.html
            target = WEB_DIR / "index.html"
            if not target.is_file():
                return self._send_json(404, {"error": {"code": "not_found", "message": "UI not built"}})
        ext = target.suffix.lower()
        ctype = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
                 ".css": "text/css; charset=utf-8", ".json": "application/json",
                 ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}.get(ext, "text/plain")
        data = target.read_bytes()
        if self._body_pending:
            self._discard_body()
        try:
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            if self.close_connection:
                self.send_header("Connection", "close")
            self._security_headers()
            self.end_headers()
            if not self._head_only:
                self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True


class Server(ThreadingHTTPServer):
    daemon_threads = True
    # The default backlog of 5 resets connections that arrive in the same
    # instant, a genuine request among them.
    request_queue_size = 128


def build_server(host: str | None = None, port: int | None = None) -> ThreadingHTTPServer:
    cfg = get_config()
    # `port is None` (not falsiness): an explicit 0 asks the OS for a free port.
    return Server((host or cfg.bind_host, cfg.bind_port if port is None else port), Handler)


def seed_public_demo(scans: bool = True) -> dict | None:
    """Create the public demo project (no-op unless FSL_PUBLIC_VIEW is on).

    Runs in a background thread after the socket is bound. It must never take
    the server down, so every failure is caught and logged in one line.

    Startup calls it twice. scans=False, before the tools are probed, only
    creates and publishes the project (database writes, no probe), so a visitor
    has something to read while the probing goes on. That pass logs nothing:
    whatever it runs into, the full pass after it runs into again and reports."""
    import sys
    try:
        out = demo.ensure_public_demo(scans=scans)
    except Exception as e:
        if scans:
            print(f"[init] public demo setup failed: {type(e).__name__}: {e}", file=sys.stderr)
        return None
    if not scans:
        return out
    if out.get("notice"):
        print(f"[setup] {describe_notice(out['notice'])}", file=sys.stderr)
    elif out.get("skipped", {}).get("*") == demo.SKIP_SCOPE_REVOKED:
        print("[init] public demo: the authorization scope was revoked by an operator; "
              "not re-issuing", file=sys.stderr)
    elif out.get("enabled"):
        print(f"[init] public demo project {out['project_id']}: "
              f"{len(out['enqueued'])} scan(s) enqueued, skipped={out['skipped']}",
              file=sys.stderr)
    return out


def main():
    import os
    # The hosted site opens to the public read-only view by default, so visitors
    # see the interface with no sign-in screen. An operator who wants a sign-in
    # for everything sets FSL_PUBLIC_VIEW=0; setdefault never overrides that.
    # Only running the server flips it on — the library/config default stays off,
    # so tests and embedders are unaffected.
    os.environ.setdefault("FSL_PUBLIC_VIEW", "1")
    cfg = get_config()
    # Tool probing is deferred until the port is bound (see below) so a small
    # instance answers its health check in seconds, not minutes.
    info = init_platform(sync_tools=False)
    for code in info["setup_notices"]:
        print(f"[setup] {describe_notice(code)}", file=sys.stderr)
    boot = info["owner_bootstrap"]
    # The start that creates the owner names the sign-in address. A password
    # is printed only when it was generated here, never one that was set.
    if boot.get("created"):
        print(f"[init] owner created: {boot['email']}", file=sys.stderr)
    if boot.get("generated"):
        print(f"[init] generated owner password, shown once: {boot['password']}",
              file=sys.stderr)
    print(f"[init] catalog={info['catalog_seeded']} ai_available={info['ai_available']}",
          file=sys.stderr)
    for line in client_address_report(cfg, os.environ):
        print(line, file=sys.stderr)

    # The connector registry is built on first use, under a lock. Build it
    # here, before any thread exists, so no worker, request or tool sync has to
    # wait for it.
    connector_names()

    # In-process worker(s) for standalone mode (disable with FSL_NO_WORKER=1 to
    # run workers as separate processes/containers).
    if os.environ.get("FSL_NO_WORKER", "") not in ("1", "true"):
        from .worker import Worker
        workers = max(1, cfg.limits.worker_concurrency)
        for i in range(workers):
            w = Worker(worker_id=f"inproc-{i}")
            threading.Thread(target=w.run_forever, daemon=True).start()
        print(f"[init] started {workers} in-process worker(s)", file=sys.stderr)

    srv = build_server()
    print(f"[serve] http://{cfg.bind_host}:{cfg.bind_port}  (Ctrl-C to stop)", file=sys.stderr)

    def _sync_tools():
        try:
            reg = sync_registry()
            print(f"[init] tool registry synced: {len(reg)} connectors", file=sys.stderr)
        except Exception as e:  # never take the server down over a probe
            print(f"[init] tool registry sync failed: {type(e).__name__}: {e}", file=sys.stderr)

    def _after_bind():
        # One thread, in this order. The demo project is published before the
        # tools are probed, which takes many seconds on a small instance, so
        # the visitor who woke the service is not shown an empty project list
        # meanwhile. Its scans are enqueued after the sync: a finished scan
        # marks its tool "verified" by updating the tool's registry row, so the
        # rows have to exist before the first demo scan is enqueued. No step
        # raises.
        if cfg.public_view:
            seed_public_demo(scans=False)
        _sync_tools()
        if cfg.public_view:
            seed_public_demo()

    if cfg.public_view:
        # After the bind, in the background: startup stays fast and a problem
        # with the demo can never stop the service from answering.
        print("[init] public read-only view is ON: visitors can read the demo project "
              "without signing in; every action still requires a sign-in", file=sys.stderr)
    else:
        print("[init] public read-only view is off (FSL_PUBLIC_VIEW=1 turns it on)",
              file=sys.stderr)
    threading.Thread(target=_after_bind, daemon=True).start()

    # A hosting platform stops a container with SIGTERM. As the first process
    # of a container this one gets no default action for it, so without a
    # handler every restart waits out the grace period and ends in a kill.
    def _stop(signum, _frame):
        print("[serve] stop signal received, shutting down", file=sys.stderr)
        threading.Thread(target=srv.shutdown, daemon=True).start()

    try:
        signal.signal(signal.SIGTERM, _stop)
    except (ValueError, OSError):       # not the main thread (tests), or unsupported
        pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[serve] shutting down", file=sys.stderr)
        srv.shutdown()


if __name__ == "__main__":
    main()
