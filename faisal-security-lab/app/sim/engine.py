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
PHISH_P = 0.9          # a believable lure lands most of the time, but it is still a draw
PRIVESC_P = 0.8        # a local privilege-escalation attempt usually works
SIEM_K = 3             # detections that must pile up before SIEM auto-isolates

# MITRE ATT&CK-style tactic labels for the red team's moves. Additive metadata
# on every event; it never changes what an event does.
_RED_TACTIC = {
    "recon": "TA0007 Discovery",
    "exploit": "TA0001 Initial Access",
    "crypto": "TA0006 Credential Access",
    "network": "TA0008 Lateral Movement",
    "phish": "TA0001 Initial Access",
    "privesc": "TA0004 Privilege Escalation",
    "exfil": "TA0010 Exfiltration",
}
# Short defensive labels for the blue team's moves.
_BLUE_TACTIC = {
    "detection": "Detect",
    "response": "Contain",
    "hardening": "Harden",
    "deception": "Deceive",
    "correlation": "Correlate",
}


@dataclass
class Event:
    turn: int
    team: str          # red | blue
    group: str         # recon|exploit|crypto|network|phish|privesc|exfil|detection|response|hardening|deception|correlation
    action: str
    target: str
    result: str        # success | fail
    detail: str = ""
    noise: float = 0.0
    detected: bool = False
    tactic: str = ""   # MITRE ATT&CK-style (red) / defensive (blue) label

    def as_dict(self) -> dict:
        return {"turn": self.turn, "team": self.team, "group": self.group,
                "action": self.action, "target": self.target, "result": self.result,
                "detail": self.detail, "detected": self.detected, "tactic": self.tactic}


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
                        "ciphers_broken": 0,
                        # additive counters for the sim-plus techniques
                        "phish": 0, "privesc": 0, "exfiltrated_bytes": 0,
                        "honeypot_trips": 0, "siem_isolations": 0}
        self.compromise_order: list[str] = []   # host ids in the order they fell
        self.exfiltrated_bytes = 0
        self._exfil_done: set = set()           # (hid, index) of loot already staged out
        self._honey_tripped: set = set()        # honeypots that have fired
        self._siem_fired = False                # SIEM correlation fires once

    # -- helpers --------------------------------------------------------------
    def _emit(self, team, group, action, target, result, detail="", noise=0.0, tactic=""):
        self.events.append(Event(self.turn, team, group, action, target, result,
                                 detail, noise, tactic=tactic))

    def reachable(self) -> set:
        reach = {h.hid for h in self.r.hosts.values()
                 if h.internet_facing and not h.isolated}
        for hid, host in self.r.hosts.items():
            if host.compromised and not host.isolated:
                # a low-privilege foothold on a host with a local privilege-
                # escalation path does not extend reach until it is escalated.
                if host.priv_esc and not host.admin:
                    continue
                reach |= {n for n in self.r.neighbours(hid)
                          if not self.r.hosts[n].isolated}
        return reach

    def _compromise(self, host: net.Host, group: str, detail: str, noise: float):
        host.compromised = True
        host.discovered = True
        self.compromise_order.append(host.hid)
        for s in host.secrets:
            if s not in self.loot:
                self.loot.append(s)
                if s.kind == "flag":
                    self.flags.append(s.data)
        if self.metrics["first_compromise_turn"] is None:
            self.metrics["first_compromise_turn"] = self.turn
        self._emit("red", group, "compromise", host.hid, "success", detail, noise,
                   tactic=_RED_TACTIC.get(group, ""))

    # -- red groups -----------------------------------------------------------
    def red_recon(self):
        for hid in sorted(self.reachable()):
            host = self.r.hosts[hid]
            if not host.discovered and not host.isolated:
                host.discovered = True
                self._emit("red", "recon", "scan", hid, "success",
                           f"{len(host.services)} services", noise=0.1,
                           tactic=_RED_TACTIC["recon"])

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
                           f"{v.kind} resisted", noise=v.noise * 0.5,
                           tactic=_RED_TACTIC["exploit"])

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
                           f"{s.kind} → {s.cracked}", noise=0.05,
                           tactic=_RED_TACTIC["crypto"])

    def red_network(self):
        # Lateral movement by reused credentials cracked from loot.
        for hid in sorted(self.reachable(), key=lambda x: -self.r.hosts[x].value):
            host = self.r.hosts[hid]
            if host.compromised or host.isolated:
                continue
            if host.cred and host.cred in self.cracked:
                self._compromise(host, "network", f"credential reuse ({host.cred})", noise=0.2)

    def red_phishing(self):
        # Initial access: a spear-phishing lure landing on a user/edge host.
        # This is how the red team gets its first foothold on segmented networks
        # with no exposed service. Hosts without a phishing flag are untouched,
        # so scenarios that do not use phishing are unaffected (no draw is made).
        for hid in sorted(self.r.hosts, key=lambda x: -self.r.hosts[x].value):
            host = self.r.hosts[hid]
            if not host.phish or host.compromised or host.isolated:
                continue
            if self.rng.random() < PHISH_P:
                self.metrics["phish"] += 1
                self._compromise(host, "phish", "foothold via spear-phishing", noise=0.3)
            else:
                self._emit("red", "phish", "attempt", hid, "fail", "lure ignored",
                           noise=0.15, tactic=_RED_TACTIC["phish"])

    def red_privesc(self):
        # On a compromised host that carries a local privilege-escalation path,
        # escalate to admin. Doing so unlocks higher-value reach (see reachable).
        for hid, host in self.r.hosts.items():
            if not host.priv_esc or host.admin:
                continue
            if not host.compromised or host.isolated:
                continue
            if self.rng.random() < PRIVESC_P:
                host.admin = True
                self.metrics["privesc"] += 1
                self._emit("red", "privesc", "escalate", hid, "success",
                           "local privilege escalation to admin", noise=0.35,
                           tactic=_RED_TACTIC["privesc"])
            else:
                self._emit("red", "privesc", "escalate", hid, "fail",
                           "no escalation path yet", noise=0.2,
                           tactic=_RED_TACTIC["privesc"])

    def red_exfil(self):
        # Stage out sized loot from compromised hosts. Deterministic and quiet in
        # the per-event sense (the SIEM catches it by correlation, not per packet),
        # so it never perturbs scenarios whose loot has no byte weight.
        for hid, host in self.r.hosts.items():
            if not host.compromised or host.isolated:
                continue
            for i, s in enumerate(host.secrets):
                key = (hid, i)
                if s.size > 0 and key not in self._exfil_done:
                    self._exfil_done.add(key)
                    self.exfiltrated_bytes += s.size
                    self.metrics["exfiltrated_bytes"] += s.size
                    self._emit("red", "exfil", "exfiltrate", hid, "success",
                               f"{s.size} bytes staged out", noise=0.0,
                               tactic=_RED_TACTIC["exfil"])

    # -- blue groups ----------------------------------------------------------
    def blue_honeypot(self):
        # A decoy host: the moment the red team touches it (discovers, exploits or
        # lands on it), the SOC gets a high-confidence alert and quarantines the
        # decoy. Deterministic, and a no-op on scenarios with no honeypots.
        for hid, host in self.r.hosts.items():
            if not host.honeypot or hid in self._honey_tripped:
                continue
            touched = host.discovered or host.compromised or any(
                e.turn == self.turn and e.team == "red" and e.target == hid
                for e in self.events)
            if not touched:
                continue
            self._honey_tripped.add(hid)
            self.metrics["detections"] += 1
            self.metrics["honeypot_trips"] += 1
            if self.metrics["first_detect_turn"] is None:
                self.metrics["first_detect_turn"] = self.turn
            self._emit("blue", "deception", "tripwire", hid, "success",
                       "decoy touched: high-confidence alert", noise=0.0,
                       tactic=_BLUE_TACTIC["deception"])
            if not host.isolated:
                host.isolated = True
                self.metrics["hosts_isolated"] += 1
                self._emit("blue", "response", "isolate", hid, "success",
                           "decoy quarantined", noise=0.0,
                           tactic=_BLUE_TACTIC["response"])

    def blue_detection(self):
        new = [e for e in self.events if e.turn == self.turn and e.team == "red" and e.noise > 0]
        for ev in new:
            if self.rng.random() < min(0.9, ev.noise * self.detection * 1.8):
                ev.detected = True
                self.metrics["detections"] += 1
                if self.metrics["first_detect_turn"] is None:
                    self.metrics["first_detect_turn"] = self.turn
                self._emit("blue", "detection", "alert", ev.target, "success",
                           f"{ev.group}:{ev.action}", noise=0.0,
                           tactic=_BLUE_TACTIC["detection"])

    def blue_response(self):
        for ev in [e for e in self.events if e.turn == self.turn and e.team == "red"
                   and e.detected and e.action == "compromise"]:
            host = self.r.hosts.get(ev.target)
            if host and not host.isolated:
                host.isolated = True
                self.metrics["hosts_isolated"] += 1
                self._emit("blue", "response", "isolate", host.hid, "success", "host cut off",
                           tactic=_BLUE_TACTIC["response"])

    def blue_siem(self):
        # SIEM correlation: once enough alerts pile up in the engagement, the
        # platform auto-isolates the most-recently-compromised reachable host.
        # Fires once, is deterministic, and only when the engagement enables it.
        if not self.r.siem or self._siem_fired:
            return
        if self.metrics["detections"] < SIEM_K:
            return
        reach = self.reachable()
        for hid in reversed(self.compromise_order):
            host = self.r.hosts[hid]
            if hid in reach and not host.isolated:
                host.isolated = True
                self.metrics["hosts_isolated"] += 1
                self.metrics["siem_isolations"] += 1
                self._siem_fired = True
                self._emit("blue", "correlation", "auto-isolate", hid, "success",
                           f"SIEM rule fired after {SIEM_K} detections", noise=0.0,
                           tactic=_BLUE_TACTIC["correlation"])
                return

    def blue_hardening(self):
        cand = [(s, h) for h in self.r.hosts.values() for s in h.services
                if s.vuln and not s.vuln.patched and not h.compromised and not h.isolated]
        cand.sort(key=lambda sh: _SEV_ORDER.get(sh[0].vuln.severity, 9))
        for s, h in cand[:PATCH_RATE]:
            s.vuln.patched = True
            self.metrics["vulns_patched"] += 1
            self._emit("blue", "hardening", "patch", h.hid, "success", f"patched {s.vuln.kind}",
                       tactic=_BLUE_TACTIC["hardening"])

    # -- the loop -------------------------------------------------------------
    def _red_can_progress(self) -> bool:
        for hid in self.reachable():
            host = self.r.hosts[hid]
            if host.compromised or host.isolated:
                continue
            if host.open_vulns() or (host.cred and host.cred in self.cracked):
                return True
        if any(not s.cracked and s.kind in ("md5_hash", "ciphertext") for s in self.loot):
            return True
        # Additive: a phishing foothold still to take, or an escalation still to
        # run, is also progress. Both clauses are false on scenarios without
        # those features, so existing scenarios are unaffected.
        if any(h.phish and not h.compromised and not h.isolated
               for h in self.r.hosts.values()):
            return True
        if any(h.priv_esc and h.compromised and not h.admin and not h.isolated
               for h in self.r.hosts.values()):
            return True
        return False

    def run(self) -> dict:
        goal = self.r.hosts[self.r.goal]
        for t in range(1, self.max_turns + 1):
            self.turn = t
            self.red_phishing()
            self.red_recon()
            self.red_exploit()
            self.red_privesc()
            self.red_crypto()
            self.red_network()
            self.red_exfil()
            self.blue_honeypot()
            self.blue_detection()
            self.blue_response()
            self.blue_siem()
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
                    "cracked": sorted(self.cracked),
                    "exfiltrated": self.exfiltrated_bytes},
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
            "narrative": self._narrative(),
            "recommendations": self._recommendations(),
            "techniques": sorted({e.tactic for e in self.events
                                  if e.team == "red" and e.tactic}),
        }

    # -- human-readable extras (additive, deterministic) ----------------------
    def _narrative(self) -> list[str]:
        """An ordered, plain-English account of the kill chain."""
        lines: list[str] = []
        for e in self.events:
            if e.team != "red" or e.result != "success":
                continue
            host = self.r.hosts.get(e.target)
            name = host.name if host else e.target
            if e.group == "phish":
                lines.append(f"Turn {e.turn}: phishing gained a foothold on {name}.")
            elif e.group == "exploit" and e.action == "compromise":
                lines.append(f"Turn {e.turn}: exploited {name} ({e.detail}).")
            elif e.group == "crypto":
                lines.append(f"Turn {e.turn}: the crypto group cracked a secret ({e.detail}).")
            elif e.group == "network":
                lines.append(f"Turn {e.turn}: moved laterally onto {name} by credential reuse.")
            elif e.group == "privesc":
                lines.append(f"Turn {e.turn}: escalated to admin on {name}.")
            elif e.group == "exfil":
                lines.append(f"Turn {e.turn}: exfiltrated data from {name} ({e.detail}).")
        for e in self.events:
            if e.team == "blue" and e.group == "deception":
                host = self.r.hosts.get(e.target)
                name = host.name if host else e.target
                lines.append(f"Turn {e.turn}: the blue team's decoy {name} tripped an alert.")
            elif e.team == "blue" and e.group == "correlation":
                lines.append(f"Turn {e.turn}: SIEM correlation auto-isolated a host.")
        goal = self.r.hosts[self.r.goal]
        if goal.compromised:
            lines.append(f"Outcome: the red team reached the goal, {goal.name}.")
        else:
            lines.append(f"Outcome: the blue team held the goal, {goal.name}.")
        return lines

    def _recommendations(self) -> list[str]:
        """Short defensive fixes derived from what the red team actually used."""
        recs: list[str] = []
        def used(group, result=None):
            return any(e.team == "red" and e.group == group
                       and (result is None or e.result == result) for e in self.events)
        if used("phish", "success"):
            recs.append("Deploy phishing-resistant MFA and run user-awareness training.")
        if used("privesc", "success"):
            recs.append("Close local privilege-escalation paths and limit local admin rights.")
        if used("network", "success"):
            recs.append("Stop credential reuse: unique secrets per host, managed in a vault.")
        if used("crypto", "success"):
            recs.append("Replace weak hashing and home-made encoding with strong, salted algorithms.")
        if used("exfil"):
            recs.append("Add egress filtering and DLP to catch large outbound transfers.")
        vuln_kinds = {s.vuln.kind for h in self.r.hosts.values()
                      for s in h.services if s.vuln}
        if "rce" in vuln_kinds:
            recs.append("Patch remote-code-execution flaws on exposed services promptly.")
        if "default_creds" in vuln_kinds:
            recs.append("Remove default credentials from every service.")
        if "sqli" in vuln_kinds:
            recs.append("Use parameterised queries to close SQL injection.")
        if "weak_auth" in vuln_kinds:
            recs.append("Enforce strong authentication with lockout and rate limiting.")
        if "exposed_secret" in vuln_kinds:
            recs.append("Pull secrets out of code and config into a managed secret store.")
        if any(h.honeypot for h in self.r.hosts.values()):
            recs.append("Keep expanding deception (honeypots) to catch lateral movement early.")
        if not self.r.siem:
            recs.append("Enable SIEM correlation so piled-up alerts trigger containment.")
        if not recs:
            recs.append("Keep up patching, network segmentation and monitoring.")
        return recs


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
