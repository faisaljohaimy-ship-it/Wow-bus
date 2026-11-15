"""Built-in simulation scenarios (virtual networks).

Secrets are generated from their plaintext so the crypto group recovers them
with the real engine: a weak hash is cracked against the lab password list, an
encoded blob is decoded, a shifted string is broken. Credentials recovered this
way reuse onto the next host, which is how the red team moves toward the goal.
All of it is make-believe — see network.py.
"""
from __future__ import annotations

import base64
import hashlib

from ..crypto import caesar_shift


def _md5(s: str) -> str:
    return hashlib.md5(s.encode()).hexdigest()


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


# "corp": a small corporate network. Internet-facing DMZ, an internal tier whose
# hosts are reached by credential reuse once the crypto group cracks the loot,
# and a core where the domain controller (the goal) lives.
CORP = {
    "goal": "dc01",
    "hosts": [
        {"id": "gw01", "name": "edge-gateway", "zone": "dmz", "zone_n": 0, "value": 10,
         "internet_facing": True,
         "services": [{"name": "https", "vuln": "sqli"}, {"name": "ssh"}]},
        {"id": "web01", "name": "public-web", "zone": "dmz", "zone_n": 0, "value": 15,
         "internet_facing": True,
         "services": [{"name": "http", "vuln": "rce"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("letmein"), "unlocks": "app01"}]},
        {"id": "app01", "name": "app-server", "zone": "internal", "zone_n": 1, "value": 25,
         "cred": "letmein",
         "services": [{"name": "ssh", "vuln": "weak_auth"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("vaultkeyredis"), "unlocks": "db01"}]},
        {"id": "db01", "name": "database", "zone": "internal", "zone_n": 1, "value": 35,
         "cred": "vaultkeyredis",
         "services": [{"name": "db", "vuln": "sqli"}],
         "secrets": [{"kind": "ciphertext", "data": caesar_shift("coreadminmaster", 7),
                      "unlocks": "dc01"}]},
        {"id": "files01", "name": "file-share", "zone": "internal", "zone_n": 1, "value": 20,
         "services": [{"name": "smb", "vuln": "default_creds"}],
         "secrets": [{"kind": "flag", "data": "FLAG{lateral-movement-via-smb}"}]},
        {"id": "dc01", "name": "domain-controller", "zone": "core", "zone_n": 2, "value": 100,
         "cred": "coreadminmaster",
         "services": [{"name": "rdp", "vuln": "weak_auth"}, {"name": "smb"}]},
    ],
    "edges": [["gw01", "web01"], ["web01", "app01"], ["app01", "db01"],
              ["app01", "files01"], ["db01", "dc01"], ["files01", "dc01"]],
}

# "range": a slightly larger flat lab, more exposed services, no credential
# chain — a straight race between exploitation and patching.
RANGE = {
    "goal": "core01",
    "hosts": [
        {"id": "edge01", "name": "edge", "zone": "dmz", "zone_n": 0, "value": 10,
         "internet_facing": True, "services": [{"name": "http", "vuln": "sqli"}]},
        {"id": "edge02", "name": "mail", "zone": "dmz", "zone_n": 0, "value": 15,
         "internet_facing": True, "services": [{"name": "smb", "vuln": "rce"}]},
        {"id": "int01", "name": "intranet", "zone": "internal", "zone_n": 1, "value": 20,
         "services": [{"name": "http", "vuln": "default_creds"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("qwerty"), "unlocks": "core01"}]},
        {"id": "int02", "name": "ci-runner", "zone": "internal", "zone_n": 1, "value": 25,
         "services": [{"name": "redis", "vuln": "exposed_secret"}]},
        {"id": "core01", "name": "secrets-vault", "zone": "core", "zone_n": 2, "value": 100,
         "cred": "qwerty", "services": [{"name": "ssh", "vuln": "weak_auth"}]},
    ],
    "edges": [["edge01", "int01"], ["edge02", "int01"], ["edge02", "int02"],
              ["int01", "core01"], ["int02", "core01"]],
}

SCENARIOS = {
    "corp": {"spec": CORP, "name_en": "Corporate breach",
             "name_ar": "اختراق شبكة شركة",
             "about_en": "DMZ to domain controller by credential reuse; the crypto "
                         "group must crack the loot to move inward.",
             "about_ar": "من المنطقة المكشوفة إلى متحكم النطاق بإعادة استخدام بيانات "
                         "الدخول؛ على فريق فكّ الشيفرات كسر الغنائم للتقدّم."},
    "range": {"spec": RANGE, "name_en": "Flat lab race",
              "name_ar": "سباق مختبر مسطّح",
              "about_en": "A straight race between exploitation and patching.",
              "about_ar": "سباق مباشر بين الاستغلال والترقيع."},
}


def scenario_names() -> list[dict]:
    return [{"id": k, "name_en": v["name_en"], "name_ar": v["name_ar"],
             "about_en": v["about_en"], "about_ar": v["about_ar"]}
            for k, v in SCENARIOS.items()]


def get_spec(scenario_id: str) -> dict | None:
    s = SCENARIOS.get(scenario_id)
    return s["spec"] if s else None
