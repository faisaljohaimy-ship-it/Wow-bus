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


# ===========================================================================
# sim-plus scenarios (bigger, 8-14 hosts). Each adds phishing initial access,
# privilege escalation, exfiltration of sized loot, a honeypot decoy and SIEM
# correlation on top of the original exploit / crypto / credential-reuse chain.
# They are registered in SCENARIOS_PLUS so the original scenario_names() keeps
# returning exactly {corp, range}; scenario_catalog() lists all five.
# ===========================================================================

# "enterprise": an Active-Directory-style network. Entry is a spear-phishing
# lure on a user workstation (no exposed service needed); the crypto group
# cracks each looted secret to reuse credentials inward, a privilege escalation
# on the CRM server unlocks the server tier, and the goal is domain admin.
ENTERPRISE = {
    "goal": "dc-root",
    "siem": True,
    "hosts": [
        {"id": "ws-user", "name": "user-workstation", "zone": "user", "zone_n": 1, "value": 8,
         "phish": True, "services": [{"name": "rdp"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("welcome"), "unlocks": "ws-it"}]},
        {"id": "ws-hr", "name": "hr-workstation", "zone": "user", "zone_n": 1, "value": 10,
         "phish": True, "services": [{"name": "rdp"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("monkey"), "unlocks": "srv-file"}]},
        {"id": "ws-it", "name": "it-admin-workstation", "zone": "user", "zone_n": 1, "value": 15,
         "cred": "welcome", "services": [{"name": "smb", "vuln": "weak_auth"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("enterprisekey"), "unlocks": "app-crm"}]},
        {"id": "mail-relay", "name": "mail-relay", "zone": "dmz", "zone_n": 0, "value": 12,
         "services": [{"name": "smb", "vuln": "weak_auth"}]},
        {"id": "app-crm", "name": "crm-server", "zone": "internal", "zone_n": 2, "value": 25,
         "cred": "enterprisekey", "priv_esc": True, "services": [{"name": "http", "vuln": "rce"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("master"), "unlocks": "srv-sql"},
                     {"kind": "flag", "data": "FLAG{crm-rce-foothold}"}]},
        {"id": "srv-sql", "name": "sql-server", "zone": "internal", "zone_n": 2, "value": 35,
         "cred": "master", "services": [{"name": "db", "vuln": "sqli"}],
         "secrets": [{"kind": "ciphertext", "data": caesar_shift("enterpriseroot", 5),
                      "unlocks": "dc-root"}]},
        {"id": "srv-file", "name": "file-server", "zone": "internal", "zone_n": 2, "value": 20,
         "services": [{"name": "smb", "vuln": "default_creds"}],
         "secrets": [{"kind": "flag", "data": "FLAG{smb-share-loot}"}]},
        {"id": "srv-backup", "name": "backup-server", "zone": "internal", "zone_n": 2, "value": 22,
         "services": [{"name": "ftp", "vuln": "default_creds"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("backupvaultkey"), "size": 3_000_000}]},
        {"id": "honey-share", "name": "decoy-share", "zone": "internal", "zone_n": 2, "value": 5,
         "honeypot": True, "services": [{"name": "smb"}]},
        {"id": "dc-root", "name": "domain-controller", "zone": "core", "zone_n": 3, "value": 100,
         "cred": "enterpriseroot", "services": [{"name": "rdp", "vuln": "weak_auth"}, {"name": "smb"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("ntdsdumpkey"), "size": 5_000_000},
                     {"kind": "flag", "data": "FLAG{domain-admin}"}]},
    ],
    "edges": [["ws-user", "ws-it"], ["ws-user", "ws-hr"], ["ws-it", "app-crm"],
              ["ws-it", "mail-relay"], ["mail-relay", "ws-hr"], ["ws-hr", "srv-file"],
              ["app-crm", "srv-sql"], ["app-crm", "srv-file"], ["app-crm", "honey-share"],
              ["srv-sql", "dc-root"], ["srv-sql", "srv-backup"]],
}

# "cloud": a public web app whose remote-code-execution bug leads to the
# instance metadata service, then to object storage. The goal is the storage
# bucket, from which a large blob is exfiltrated. An internet-facing decoy
# bucket trips the blue team's deception the moment recon touches it.
CLOUD = {
    "goal": "storage",
    "siem": True,
    "hosts": [
        {"id": "lb", "name": "load-balancer", "zone": "dmz", "zone_n": 0, "value": 10,
         "internet_facing": True, "services": [{"name": "https"}]},
        {"id": "web-app", "name": "public-web-app", "zone": "dmz", "zone_n": 0, "value": 18,
         "internet_facing": True, "services": [{"name": "http", "vuln": "rce"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("metadatatoken"), "unlocks": "meta"}]},
        {"id": "honey-bucket", "name": "decoy-bucket", "zone": "dmz", "zone_n": 0, "value": 5,
         "internet_facing": True, "honeypot": True, "services": [{"name": "http"}]},
        {"id": "meta", "name": "metadata-service", "zone": "internal", "zone_n": 1, "value": 20,
         "cred": "metadatatoken", "services": [{"name": "http"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("iamrolecreds"), "unlocks": "storage"}]},
        {"id": "storage", "name": "object-storage", "zone": "internal", "zone_n": 1, "value": 40,
         "cred": "iamrolecreds", "services": [{"name": "http"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("bucketexfilkey"), "size": 8_000_000},
                     {"kind": "flag", "data": "FLAG{bucket-exfil}"}]},
        {"id": "api", "name": "api-server", "zone": "internal", "zone_n": 1, "value": 22,
         "services": [{"name": "http", "vuln": "sqli"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("dragon"), "unlocks": "db-users"}]},
        {"id": "db-users", "name": "user-database", "zone": "internal", "zone_n": 1, "value": 30,
         "cred": "dragon", "services": [{"name": "db", "vuln": "sqli"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("pivotsharekey"), "size": 2_000_000},
                     {"kind": "flag", "data": "FLAG{pii-dump}"}]},
        {"id": "cache", "name": "redis-cache", "zone": "internal", "zone_n": 1, "value": 15,
         "services": [{"name": "redis", "vuln": "exposed_secret"}]},
        {"id": "ci", "name": "ci-runner", "zone": "internal", "zone_n": 1, "value": 20,
         "services": [{"name": "ssh", "vuln": "weak_auth"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("shadow")}]},
    ],
    "edges": [["lb", "web-app"], ["lb", "ci"], ["web-app", "meta"], ["web-app", "honey-bucket"],
              ["web-app", "api"], ["web-app", "ci"], ["meta", "storage"],
              ["api", "db-users"], ["api", "cache"]],
}

# "ot": an IT network segmented from an operational-technology (OT) network.
# The only bridge is a jump host; crossing it needs a privilege escalation.
# A decoy PLC sits in IT as a trip-wire, and the goal is the SCADA master.
OT = {
    "goal": "ot-scada",
    "siem": True,
    "hosts": [
        {"id": "it-edge", "name": "it-edge-web", "zone": "it-dmz", "zone_n": 0, "value": 10,
         "internet_facing": True, "services": [{"name": "http", "vuln": "sqli"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("pivotsharekey"), "unlocks": "it-jump"}]},
        {"id": "it-ws", "name": "it-workstation", "zone": "it-user", "zone_n": 1, "value": 12,
         "phish": True, "services": [{"name": "rdp"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("changeme"), "unlocks": "it-ad"}]},
        {"id": "it-ad", "name": "it-directory", "zone": "it", "zone_n": 1, "value": 25,
         "cred": "changeme", "services": [{"name": "smb", "vuln": "weak_auth"}],
         "secrets": [{"kind": "flag", "data": "FLAG{it-ad-compromise}"}]},
        {"id": "it-file", "name": "it-file-server", "zone": "it", "zone_n": 1, "value": 15,
         "services": [{"name": "smb", "vuln": "default_creds"}],
         "secrets": [{"kind": "flag", "data": "FLAG{it-share-loot}"}]},
        {"id": "it-jump", "name": "it-ot-jump-host", "zone": "it", "zone_n": 1, "value": 20,
         "cred": "pivotsharekey", "priv_esc": True, "services": [{"name": "ssh", "vuln": "weak_auth"}],
         "secrets": [{"kind": "ciphertext", "data": caesar_shift("otcorebreaker", 11),
                      "unlocks": "ot-hist"}]},
        {"id": "honey-plc", "name": "decoy-plc", "zone": "it", "zone_n": 1, "value": 5,
         "honeypot": True, "services": [{"name": "http"}]},
        {"id": "ot-hist", "name": "ot-historian", "zone": "ot", "zone_n": 2, "value": 30,
         "cred": "otcorebreaker", "services": [{"name": "http", "vuln": "rce"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("historiankey"), "unlocks": "ot-hmi"}]},
        {"id": "ot-hmi", "name": "ot-hmi", "zone": "ot", "zone_n": 2, "value": 28,
         "cred": "historiankey", "services": [{"name": "http", "vuln": "weak_auth"}],
         "secrets": [{"kind": "md5_hash", "data": _md5("hunter2"), "unlocks": "ot-scada"}]},
        {"id": "ot-plc1", "name": "ot-plc-1", "zone": "ot", "zone_n": 2, "value": 40,
         "services": [{"name": "http", "vuln": "default_creds"}],
         "secrets": [{"kind": "flag", "data": "FLAG{plc1-logic}"}]},
        {"id": "ot-plc2", "name": "ot-plc-2", "zone": "ot", "zone_n": 2, "value": 35,
         "services": [{"name": "http", "vuln": "default_creds"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("plclogickey"), "size": 1_500_000}]},
        {"id": "ot-rtu", "name": "ot-rtu", "zone": "ot", "zone_n": 2, "value": 22,
         "services": [{"name": "http", "vuln": "weak_auth"}]},
        {"id": "ot-scada", "name": "scada-master", "zone": "ot", "zone_n": 2, "value": 100,
         "cred": "hunter2", "services": [{"name": "rdp", "vuln": "weak_auth"}],
         "secrets": [{"kind": "ciphertext", "data": _b64("segmentbreaker"), "size": 4_000_000},
                     {"kind": "flag", "data": "FLAG{scada-takeover}"}]},
    ],
    "edges": [["it-edge", "it-jump"], ["it-edge", "it-ws"], ["it-ws", "it-ad"],
              ["it-ad", "it-file"], ["it-ad", "it-jump"], ["it-jump", "honey-plc"],
              ["it-jump", "ot-hist"], ["ot-hist", "ot-hmi"], ["ot-hist", "ot-plc1"],
              ["ot-hmi", "ot-scada"], ["ot-hmi", "ot-plc2"], ["ot-plc1", "ot-rtu"],
              ["ot-scada", "ot-rtu"]],
}

SCENARIOS_PLUS = {
    "enterprise": {"spec": ENTERPRISE, "name_en": "Enterprise AD breach",
                   "name_ar": "اختراق مجال المؤسسة",
                   "about_en": "Spear-phish a workstation, crack the loot inward, escalate on "
                               "the CRM server and take domain admin.",
                   "about_ar": "تصيّد موجّه لمحطة عمل، وكسر الغنائم للداخل، وتصعيد الصلاحيات على "
                               "خادم إدارة العملاء للوصول إلى مدير المجال."},
    "cloud": {"spec": CLOUD, "name_en": "Cloud metadata to storage",
              "name_ar": "من بيانات السحابة إلى التخزين",
              "about_en": "A web-app RCE reaches the metadata service, then object storage, "
                          "and a large blob is exfiltrated past a decoy bucket.",
              "about_ar": "ثغرة تنفيذ تعليمات في تطبيق الويب تصل إلى خدمة البيانات الوصفية ثم "
                          "التخزين، وتسريب كتلة كبيرة مع وجود دلو خادع."},
    "ot": {"spec": OT, "name_en": "IT to OT crossover",
           "name_ar": "من تقنية المعلومات إلى التشغيل",
           "about_en": "Cross from IT into a segmented OT network through a jump host that "
                       "needs privilege escalation; a decoy PLC trips the alarm.",
           "about_ar": "العبور من تقنية المعلومات إلى شبكة تشغيل معزولة عبر خادم وسيط يتطلب "
                       "تصعيد صلاحيات؛ متحكّم منطقي خادع يُطلق الإنذار."},
}

# Every scenario, for lookup; scenario_names() stays limited to the original two.
ALL_SCENARIOS = {**SCENARIOS, **SCENARIOS_PLUS}


def scenario_names() -> list[dict]:
    return [{"id": k, "name_en": v["name_en"], "name_ar": v["name_ar"],
             "about_en": v["about_en"], "about_ar": v["about_ar"]}
            for k, v in SCENARIOS.items()]


def scenario_catalog() -> list[dict]:
    """Every scenario (the original two plus the sim-plus three)."""
    return [{"id": k, "name_en": v["name_en"], "name_ar": v["name_ar"],
             "about_en": v["about_en"], "about_ar": v["about_ar"]}
            for k, v in ALL_SCENARIOS.items()]


def get_spec(scenario_id: str) -> dict | None:
    s = ALL_SCENARIOS.get(scenario_id)
    return s["spec"] if s else None
