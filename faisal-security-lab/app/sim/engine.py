"""The attack/defence simulation engine.

Turn by turn, the red groups act — reconnaissance, exploitation, cipher-breaking
of looted secrets (with the real crypto engine), and lateral movement by reused
credentials — and the blue groups react — detection, response (isolation) and
hardening (patching). It is fully deterministic for a given seed, so a run can
be replayed and tested. Everything happens on the in-memory virtual network in
network.py; nothing here reaches a real host.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from .. import crypto
from ..lab.passwords import LAB_PASSWORDS
from . import network as net
from .scenarios import SCENARIOS, get_spec

_SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
RECON_RATE = 3
PATCH_RATE = 2


@dataclass
class Event:
    turn: int
    team: str          # red | blue
    group: str         # recon|exploit|crypto|network|detection|response|hardening
    action: str
    target: str
    result: str        # success | fail
    detail: str = ""
    noise: float = 0.0
    detected: bool = False

    def as_dict(self) -> dict:
        return {"turn": self.turn, "team": self.team, "group": self.group,
                "action": self.action, "target": self.target, "result": self.result,
                "detail": self.detail, "detected": self.detected}


class Simulation:
    def __init__(self, range_: net.Range, *, seed: int = 0,
                 detection: float = 0.5, max_turns: int = 24):
        self.r = range_
        self.rng = random.Random(seed)
        self.detection = detection
        self.max_turns = max_turns
        self.turn = 0
        self.events: list[Event] = []
        self.loot: list[net.Secret] = []
        self.cracked: set[str] = set()
        self.flags: list[str] = []
        self.outcome = "running"
        self.metrics = {"first_compromise_turn": None, "first_detect_turn": None,
                        "vulns_patched": 0, "hosts_isolated": 0, "detections": 0,
                        "ciphers_broken": 0}

    # -- helpers --------------------------------------------------------------
    def _emit(self, team, group, action, target, result, detail="", noise=0.0):
        self.events.append(Event(self.turn, team, group, action, target, result,
                                 detail, noise))

    def reachable(self) -> set:
        reach = {h.hid for h in self.r.hosts.values()
                 if h.internet_facing and not h.isolated}
        for hid, host in self.r.hosts.items():
            if host.compromised and not host.isolated:
                reach |= {n for n in self.r.neighbours(hid)
                          if not self.r.hosts[n].isolated}
        return reach

    def _compromise(self, host: net.Host, group: str, detail: str, noise: float):
        host.compromised = True
        host.discovered = True
        for s in host.secrets:
            if s not in self.loot:
                self.loot.append(s)
                if s.kind == "flag":
                    self.flags.append(s.data)
        if self.metrics["first_compromise_turn"] is None:
            self.metrics["first_compromise_turn"] = self.turn
        self._emit("red", group, "compromise", host.hid, "success", detail, noise)

    # -- red groups -----------------------------------------------------------
    def red_recon(self):
        for hid in sorted(self.reachable()):
            host = self.r.hosts[hid]
            if not host.discovered and not host.isolated:
                host.discovered = True
                self._emit("red", "recon", "scan", hid, "success",
                           f"{len(host.services)} services", noise=0.1)

    def red_exploit(self):
        for hid in sorted(self.reachable(), key=lambda x: -self.r.hosts[x].value):
            host = self.r.hosts[hid]
            if host.compromised or host.isolated or not host.discovered:
                continue
            vulns = host.open_vulns()
            if not vulns:
                continue
            v = max(vulns, key=lambda x: x.exploitability)
            if self.rng.random() < v.exploitability:
                self._compromise(host, "exploit", f"exploited {v.kind} ({v.severity})", v.noise)
            else:
                self._emit("red", "exploit", "attempt", hid, "fail",
                           f"{v.kind} resisted", noise=v.noise * 0.5)

    def red_crypto(self):
        for s in self.loot:
            if s.cracked or s.kind == "flag":
                continue
            if s.kind == "cred":
                s.cracked = s.data
            elif s.kind == "md5_hash":
                res = crypto.dictionary_attack(s.data, LAB_PASSWORDS)
                if res.get("found"):
                    s.cracked = res["word"]
            elif s.kind == "ciphertext":
                dec = crypto.auto_decode(s.data)
                if dec["chain"]:
                    s.cracked = dec["text"]
                else:
                    a = crypto.analyze(s.data)
                    if a["readable"]:
                        s.cracked = a["best"]["text"]
            if s.cracked:
                self.cracked.add(s.cracked.strip())
                self.metrics["ciphers_broken"] += 1
                self._emit("red", "crypto", "crack", s.unlocks or "-", "success",
                           f"{s.kind} → {s.cracked}", noise=0.05)

    def red_network(self):
        # Lateral movement by reused credentials cracked from loot.
        for hid in sorted(self.reachable(), key=lambda x: -self.r.hosts[x].value):
            host = self.r.hosts[hid]
            if host.compromised or host.isolated:
                continue
            if host.cred and host.cred in self.cracked:
                self._compromise(host, "network", f"credential reuse ({host.cred})", noise=0.2)

    # -- blue groups ----------------------------------------------------------
    def blue_detection(self):
        new = [e for e in self.events if e.turn == self.turn and e.team == "red" and e.noise > 0]
        for ev in new:
            if self.rng.random() < min(0.9, ev.noise * self.detection * 1.8):
                ev.detected = True
                self.metrics["detections"] += 1
                if self.metrics["first_detect_turn"] is None:
                    self.metrics["first_detect_turn"] = self.turn
                self._emit("blue", "detection", "alert", ev.target, "success",
                           f"{ev.group}:{ev.action}", noise=0.0)

    def blue_response(self):
        for ev in [e for e in self.events if e.turn == self.turn and e.team == "red"
                   and e.detected and e.action == "compromise"]:
            host = self.r.hosts.get(ev.target)
            if host and not host.isolated:
                host.isolated = True
                self.metrics["hosts_isolated"] += 1
                self._emit("blue", "response", "isolate", host.hid, "success", "host cut off")

    def blue_hardening(self):
        cand = [(s, h) for h in self.r.hosts.values() for s in h.services
                if s.vuln and not s.vuln.patched and not h.compromised and not h.isolated]
        cand.sort(key=lambda sh: _SEV_ORDER.get(sh[0].vuln.severity, 9))
        for s, h in cand[:PATCH_RATE]:
            s.vuln.patched = True
            self.metrics["vulns_patched"] += 1
            self._emit("blue", "hardening", "patch", h.hid, "success", f"patched {s.vuln.kind}")

    # -- the loop -------------------------------------------------------------
    def _red_can_progress(self) -> bool:
        for hid in self.reachable():
            host = self.r.hosts[hid]
            if host.compromised or host.isolated:
                continue
            if host.open_vulns() or (host.cred and host.cred in self.cracked):
                return True
        return any(not s.cracked and s.kind in ("md5_hash", "ciphertext") for s in self.loot)

    def run(self) -> dict:
        goal = self.r.hosts[self.r.goal]
        for t in range(1, self.max_turns + 1):
            self.turn = t
            self.red_recon()
            self.red_exploit()
            self.red_crypto()
            self.red_network()
            self.blue_detection()
            self.blue_response()
            self.blue_hardening()
            if goal.compromised:
                self.outcome = "red_win"
                break
            if not self._red_can_progress():
                self.outcome = "blue_hold"
                break
        else:
            self.outcome = "blue_hold"
        return self.report()

    # -- report ---------------------------------------------------------------
    def report(self) -> dict:
        compromised = [h for h in self.r.hosts.values() if h.compromised]
        red_score = (sum(h.value for h in compromised) + len(self.flags) * 50
                     + self.metrics["ciphers_broken"] * 10)
        blue_score = (self.metrics["detections"] * 10 + self.metrics["vulns_patched"] * 8
                      + self.metrics["hosts_isolated"] * 15
                      + (0 if self.r.hosts[self.r.goal].compromised else 100))
        return {
            "outcome": self.outcome,
            "turns": self.turn,
            "goal": {"hid": self.r.goal, "name": self.r.hosts[self.r.goal].name,
                     "compromised": self.r.hosts[self.r.goal].compromised},
            "red": {"score": red_score,
                    "hosts_compromised": len(compromised),
                    "hosts_total": len(self.r.hosts),
                    "flags": list(self.flags),
                    "ciphers_broken": self.metrics["ciphers_broken"],
                    "cracked": sorted(self.cracked)},
            "blue": {"score": blue_score,
                     "detections": self.metrics["detections"],
                     "vulns_patched": self.metrics["vulns_patched"],
                     "hosts_isolated": self.metrics["hosts_isolated"],
                     "first_detect_turn": self.metrics["first_detect_turn"]},
            "metrics": dict(self.metrics),
            "hosts": [{"hid": h.hid, "name": h.name, "zone": h.zone, "value": h.value,
                       "discovered": h.discovered, "compromised": h.compromised,
                       "isolated": h.isolated} for h in self.r.hosts.values()],
            "timeline": [e.as_dict() for e in self.events],
        }


def run(scenario_id: str, *, seed: int = 0, detection: float = 0.5,
        max_turns: int = 24) -> dict:
    """Build a scenario's virtual network and play the simulation to the end."""
    spec = get_spec(scenario_id)
    if not spec:
        return {"error": f"unknown scenario '{scenario_id}'"}
    range_ = net.build_range(spec, seed=seed)
    sim = Simulation(range_, seed=seed, detection=detection, max_turns=max_turns)
    out = sim.run()
    out["scenario"] = scenario_id
    out["seed"] = seed
    out["detection"] = detection
    return out
