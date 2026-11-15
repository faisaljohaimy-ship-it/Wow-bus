"""The virtual network for the attack/defence simulation.

Everything here is make-believe: hosts, services, vulnerabilities, secrets and
the links between them exist only as objects in memory. The simulation never
touches a real host, a real port or a real network. It is a training range —
the safe place the "attack on networks" the owner asked for is played out, as a
simulation (محاكاة), against built-in virtual targets only.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field


@dataclass
class Vuln:
    vid: str
    kind: str              # weak_auth | rce | sqli | default_creds | weak_crypto | exposed_secret
    severity: str          # low | medium | high | critical
    exploitability: float  # 0..1 base chance an exploit attempt succeeds
    noise: float           # 0..1 how loud exploiting it is (how easily the blue team sees it)
    patched: bool = False


@dataclass
class Service:
    name: str              # ssh | http | db | smb | rdp ...
    port: int
    version: str
    vuln: Vuln | None = None
    open: bool = True


@dataclass
class Secret:
    """A piece of loot found on a host. A hash or ciphertext must be broken by
    the crypto group (with the real engine) before the plaintext can be used;
    a cred, once recovered, may unlock another host by credential reuse."""
    kind: str              # md5_hash | ciphertext | cred | flag
    data: str
    cracked: str = ""      # recovered plaintext, once the crypto group breaks it
    unlocks: str = ""      # host id this cred reuses onto, if any


@dataclass
class Host:
    hid: str
    name: str
    ip: str
    zone: str              # dmz | internal | core
    value: int             # worth to the attacker; the crown jewel is highest
    services: list[Service] = field(default_factory=list)
    secrets: list[Secret] = field(default_factory=list)
    internet_facing: bool = False
    discovered: bool = False
    compromised: bool = False
    isolated: bool = False      # the blue team cut it off
    cred: str = ""              # the password that reuses onto this host (if any)

    def open_vulns(self) -> list[Vuln]:
        return [s.vuln for s in self.services
                if s.open and s.vuln and not s.vuln.patched]


@dataclass
class Range:
    hosts: dict[str, Host]
    edges: dict[str, set]       # host id -> set of reachable host ids (topology)
    goal: str                   # the crown-jewel host id the red team wants

    def neighbours(self, hid: str) -> set:
        return self.edges.get(hid, set())


# --- severity / exploitability templates for the vuln kinds ------------------
_VULN_TEMPLATES = {
    "default_creds": ("high", 0.85, 0.5),
    "weak_auth": ("medium", 0.6, 0.4),
    "rce": ("critical", 0.7, 0.8),
    "sqli": ("high", 0.65, 0.6),
    "weak_crypto": ("medium", 0.55, 0.3),
    "exposed_secret": ("high", 0.9, 0.2),
}

_SERVICE_POOL = [
    ("ssh", 22, "OpenSSH 7.4"), ("http", 80, "nginx 1.14"),
    ("https", 443, "nginx 1.14"), ("db", 5432, "PostgreSQL 11"),
    ("smb", 445, "Samba 4.9"), ("rdp", 3389, "xrdp 0.9"),
    ("redis", 6379, "Redis 5.0"), ("ftp", 21, "vsftpd 3.0"),
]


def _mk_vuln(rng: random.Random, kind: str, i: int) -> Vuln:
    sev, exp, noise = _VULN_TEMPLATES[kind]
    return Vuln(vid=f"V-{kind}-{i}", kind=kind, severity=sev,
                exploitability=exp, noise=noise)


def build_range(spec: dict, seed: int = 0) -> Range:
    """Construct a virtual network from a scenario spec.

    spec = {hosts: [{id,name,zone,value,internet_facing,services:[kind...],
                     secrets:[{kind,data,unlocks?}], cred?}],
            edges: [[a,b], ...], goal: host_id}
    Services named by a vuln kind get that vuln; a bare service name is clean.
    """
    rng = random.Random(seed)
    hosts: dict[str, Host] = {}
    for i, h in enumerate(spec["hosts"]):
        services = []
        for j, s in enumerate(h.get("services", [])):
            name = s if isinstance(s, str) else s["name"]
            vuln = None
            if isinstance(s, dict) and s.get("vuln"):
                vuln = _mk_vuln(rng, s["vuln"], i * 10 + j)
            base = next((x for x in _SERVICE_POOL if x[0] == name), (name, 1000 + j, "unknown"))
            services.append(Service(name=base[0], port=base[1], version=base[2], vuln=vuln))
        secrets = [Secret(kind=s["kind"], data=s["data"], unlocks=s.get("unlocks", ""))
                   for s in h.get("secrets", [])]
        hosts[h["id"]] = Host(
            hid=h["id"], name=h["name"], ip=f"10.0.{h.get('zone_n', 0)}.{i + 10}",
            zone=h["zone"], value=h.get("value", 10), services=services, secrets=secrets,
            internet_facing=h.get("internet_facing", False), cred=h.get("cred", ""))
    edges: dict[str, set] = {h: set() for h in hosts}
    for a, b in spec.get("edges", []):
        edges.setdefault(a, set()).add(b)
        edges.setdefault(b, set()).add(a)   # links are two-way
    return Range(hosts=hosts, edges=edges, goal=spec["goal"])
