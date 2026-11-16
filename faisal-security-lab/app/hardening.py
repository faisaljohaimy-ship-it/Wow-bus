"""Defensive hardening advisor — defensive-only, advisory.

This is the defensive counterpart to the attack demos people share (Wi-Fi
snooping, BadUSB/HID attacks, weak home-network configuration): instead of
attacking anyone, it tells you how to PROTECT the things you own. Given a domain
— your own Wi-Fi/router, your USB & endpoints, your home/SMB network — it lists
the security controls that harden it, and scores a self-assessment of which ones
are in place.

It scans nothing, touches no network, and runs no tool: every control is generic
public guidance about an asset you control. `recommend_for_findings` links real
scan findings to the controls that would reduce them, so the analyzer's output
ends in concrete defensive actions.
"""
from __future__ import annotations

_W = {"high": 3, "medium": 2, "low": 1}


def _c(cid, domain, priority, ar_title, en_title, ar_why, en_why, ar_how, en_how, ref="", tags=()):
    return {"id": cid, "domain": domain, "priority": priority,
            "title": {"ar": ar_title, "en": en_title},
            "why": {"ar": ar_why, "en": en_why},
            "how": {"ar": ar_how, "en": en_how},
            "ref": ref, "tags": list(tags)}


DOMAINS = {
    "wifi": {"ar": "تحصين شبكتك اللاسلكية", "en": "Harden your Wi-Fi / router"},
    "usb_endpoint": {"ar": "الحماية من هجمات USB والأجهزة", "en": "USB & endpoint (BadUSB) defence"},
    "network": {"ar": "تحصين الشبكة والحسابات", "en": "Network & account hardening"},
}

CONTROLS = [
    # --- Wi-Fi (your own network) -----------------------------------------
    _c("wifi.encryption", "wifi", "high",
       "استخدم تشفير WPA3 (أو WPA2-AES) وتجنّب WEP/WPA/TKIP والشبكة المفتوحة",
       "Use WPA3 (or WPA2-AES); never WEP/WPA/TKIP or an open network",
       "التشفير الضعيف أو المفتوح يسمح بالتنصّت على مرورك وكسر كلمة الشبكة.",
       "Weak or open encryption lets anyone snoop your traffic or crack the key.",
       "من إعدادات الراوتر: الأمان = WPA3-Personal، أو WPA2-AES إن لم يتوفر WPA3.",
       "In the router's wireless security settings, set WPA3-Personal, or WPA2-AES if WPA3 is unavailable.",
       tags=("wifi", "network", "crypto")),
    _c("wifi.passphrase", "wifi", "high",
       "كلمة مرور لاسلكية طويلة وفريدة (16+ محرفًا)",
       "A long, unique Wi-Fi passphrase (16+ characters)",
       "كلمة قصيرة أو شائعة تُكسر بالقاموس خلال دقائق.",
       "A short or common passphrase is cracked by dictionary attack in minutes.",
       "غيّر كلمة الشبكة إلى عبارة طويلة لا تُستخدم في أي مكان آخر.",
       "Change the Wi-Fi password to a long passphrase not reused anywhere else.",
       tags=("wifi", "password")),
    _c("wifi.admin_creds", "wifi", "high",
       "غيّر اسم وكلمة مرور دخول الراوتر الافتراضيين",
       "Change the router's default admin username and password",
       "بيانات الدخول الافتراضية معروفة للجميع وتتيح السيطرة الكاملة على الراوتر.",
       "Default admin credentials are publicly known and grant full control of the router.",
       "ادخل لوحة الراوتر وغيّر اسم المستخدم وكلمة المرور الإداريين.",
       "Log in to the router admin panel and change the admin username and password.",
       tags=("wifi", "default-credentials", "network")),
    _c("wifi.wps_off", "wifi", "high",
       "عطّل WPS",
       "Disable WPS",
       "رقم WPS المكوّن من 8 خانات قابل للكسر بالقوة الغاشمة ويمنح كلمة الشبكة.",
       "The 8-digit WPS PIN is brute-forceable and hands over the Wi-Fi key.",
       "من إعدادات الراوتر، أوقف WPS / الاتصال بالضغطة.",
       "In the router settings, turn WPS / push-button connect off.",
       tags=("wifi",)),
    _c("wifi.remote_admin_off", "wifi", "high",
       "عطّل الإدارة عن بُعد (من الإنترنت)",
       "Disable remote/WAN administration",
       "إدارة الراوتر من الإنترنت تعرّضه للهجوم من أي مكان.",
       "WAN-side admin exposes the router to attack from anywhere on the internet.",
       "أوقف 'Remote management' / 'WAN access' في إعدادات الراوتر.",
       "Turn off 'Remote management' / 'WAN access' in the router settings.",
       tags=("wifi", "network")),
    _c("wifi.pmf", "wifi", "medium",
       "فعّل حماية إطارات الإدارة (PMF / 802.11w)",
       "Enable Protected Management Frames (PMF / 802.11w)",
       "بدونها يمكن فصل أجهزتك بهجوم deauth والتقاط المصافحة.",
       "Without it, devices can be knocked off with deauth attacks and the handshake captured.",
       "فعّل 'Protected Management Frames' (مطلوب/اختياري) في إعدادات الواي-فاي.",
       "Enable 'Protected Management Frames' (required/optional) in the Wi-Fi settings.",
       tags=("wifi",)),
    _c("wifi.guest_isolation", "wifi", "medium",
       "اعزل الزوّار وأجهزة إنترنت الأشياء على شبكة ضيوف",
       "Put guests and IoT devices on an isolated guest network",
       "جهاز ضعيف واحد على شبكتك الرئيسية يفتح الباب لبقية الأجهزة.",
       "One weak device on your main network is a foothold to all the others.",
       "فعّل شبكة الضيوف مع عزل العملاء، وضع أجهزة IoT عليها.",
       "Enable the guest network with client isolation and put IoT devices on it.",
       tags=("wifi", "network", "iot")),
    _c("wifi.firmware", "wifi", "medium",
       "حدّث برنامج الراوتر (firmware)",
       "Keep the router firmware updated",
       "ثغرات الراوتر المعروفة تُستغل إذا لم يُحدّث.",
       "Known router vulnerabilities are exploited when firmware is left outdated.",
       "فعّل التحديث التلقائي أو حدّث يدويًا من موقع الشركة المصنّعة.",
       "Enable auto-update or update manually from the manufacturer's site.",
       tags=("wifi", "patch", "network")),
    _c("wifi.ssid_default", "wifi", "low",
       "غيّر اسم الشبكة الافتراضي (لا تكشف طراز الراوتر)",
       "Rename the default SSID (don't leak the router model)",
       "الاسم الافتراضي يكشف الطراز فيسهّل البحث عن ثغراته؛ الإخفاء وحده ليس حماية.",
       "A default SSID leaks the model, easing targeted exploits; hiding it alone is not protection.",
       "غيّر اسم الشبكة إلى اسم لا يدل على الطراز أو صاحبه.",
       "Change the SSID to a name that does not reveal the model or owner.",
       tags=("wifi",)),

    # --- USB / endpoint (BadUSB / HID defence) ----------------------------
    _c("usb.lock_screen", "usb_endpoint", "high",
       "اقفل الشاشة تلقائيًا واطلب كلمة المرور",
       "Auto-lock the screen and require a password",
       "هجمات USB التي تحاكي لوحة المفاتيح (BadUSB/HID) تحتاج جلسة مفتوحة؛ القفل يوقفها.",
       "Keyboard-emulating USB attacks (BadUSB/HID) need an unlocked session; a lock stops them.",
       "اضبط قفل الشاشة بعد دقيقة من الخمول مع كلمة مرور.",
       "Set the screen to lock after a minute idle, with a password.",
       tags=("usb", "endpoint", "badusb")),
    _c("usb.autorun_off", "usb_endpoint", "high",
       "عطّل التشغيل التلقائي (Autorun/Autoplay)",
       "Disable autorun / autoplay",
       "التشغيل التلقائي ينفّذ محتوى الذاكرة المدسوسة بمجرد توصيلها.",
       "Autorun executes a planted drive's payload the moment it is plugged in.",
       "عطّل Autoplay لكل الوسائط من إعدادات النظام / سياسة المجموعة.",
       "Disable Autoplay for all media in the OS settings / group policy.",
       tags=("usb", "endpoint", "badusb")),
    _c("usb.no_unknown", "usb_endpoint", "high",
       "لا توصّل أي جهاز USB مجهول، وعامل ما تجده كعدائي",
       "Never plug in an unknown USB device; treat found drives as hostile",
       "الذواكر المتروكة قصدًا هي ناقل شائع لهجمات BadUSB.",
       "Deliberately dropped drives are a common BadUSB delivery vector.",
       "لا تستخدم إلا أجهزة تملكها وتثق بمصدرها.",
       "Use only devices you own and whose origin you trust.",
       tags=("usb", "endpoint", "badusb")),
    _c("usb.patch", "usb_endpoint", "high",
       "حدّث نظام التشغيل وبرامج التعريف باستمرار",
       "Keep the OS and drivers patched",
       "كثير من حالات التعطّل/شاشة الموت الزرقاء عبر USB تستغل ثغرات تعريفات قديمة.",
       "Many USB-triggered crashes/BSODs exploit vulnerabilities in outdated drivers.",
       "فعّل التحديثات التلقائية لنظام التشغيل والتعريفات.",
       "Enable automatic OS and driver updates.",
       tags=("usb", "endpoint", "patch", "dos")),
    _c("usb.port_control", "usb_endpoint", "medium",
       "قيّد منافذ USB غير المستخدمة أو استخدم حاجب بيانات",
       "Restrict unused USB ports or use a data blocker",
       "تقييد المنافذ يقلّص سطح هجمات الأجهزة المدسوسة.",
       "Limiting ports shrinks the attack surface for planted devices.",
       "عطّل المنافذ غير اللازمة، أو استخدم أدوات التحكم بأجهزة USB / حاجب بيانات للشحن.",
       "Disable unneeded ports, or use USB device-control software / a charge-only data blocker.",
       tags=("usb", "endpoint", "badusb")),
    _c("usb.boot_order", "usb_endpoint", "medium",
       "امنع الإقلاع من USB واضبط كلمة مرور BIOS/UEFI",
       "Disable booting from USB and set a BIOS/UEFI password",
       "الإقلاع من ذاكرة خارجية يتجاوز حماية النظام ويقرأ بياناتك.",
       "Booting from external media bypasses OS protections and reads your data.",
       "من BIOS/UEFI: أزل USB من ترتيب الإقلاع واضبط كلمة مرور للإعدادات.",
       "In BIOS/UEFI, remove USB from the boot order and set a setup password.",
       tags=("usb", "endpoint")),
    _c("usb.disk_encryption", "usb_endpoint", "medium",
       "فعّل تشفير القرص الكامل",
       "Enable full-disk encryption",
       "بدون تشفير، جهاز مسروق أو مُقلَع من USB يكشف كل بياناتك.",
       "Without encryption, a stolen or USB-booted machine exposes all your data.",
       "فعّل BitLocker (ويندوز) أو FileVault (ماك) أو LUKS (لينكس).",
       "Turn on BitLocker (Windows), FileVault (macOS) or LUKS (Linux).",
       tags=("endpoint", "crypto")),

    # --- Network & accounts -----------------------------------------------
    _c("net.default_creds", "network", "high",
       "غيّر بيانات الدخول الافتراضية على كل جهاز وخدمة",
       "Change default credentials on every device and service",
       "البيانات الافتراضية أول ما يجرّبه المهاجم.",
       "Default credentials are the first thing an attacker tries.",
       "راجع كل جهاز (كاميرات، راوتر، NAS…) وغيّر كلمات المرور الافتراضية.",
       "Go through each device (cameras, router, NAS…) and change default passwords.",
       tags=("default-credentials", "password", "network")),
    _c("net.mfa", "network", "high",
       "فعّل التحقق بخطوتين (MFA) على الحسابات المهمة",
       "Enable multi-factor authentication (MFA) on important accounts",
       "MFA يمنع الدخول حتى لو سُرقت كلمة المرور.",
       "MFA blocks access even if the password is stolen.",
       "فعّل MFA على البريد والبنك ومزوّد الاستضافة والحسابات الحسّاسة.",
       "Enable MFA on email, banking, your hosting provider and sensitive accounts.",
       tags=("auth", "password")),
    _c("net.patch", "network", "high",
       "حدّث نظام التشغيل والتطبيقات بسرعة",
       "Patch the OS and applications promptly",
       "معظم الاختراقات تستغل ثغرات لها تحديث متوفّر.",
       "Most breaches exploit vulnerabilities that already have a patch.",
       "فعّل التحديثات التلقائية وراجعها دوريًا.",
       "Enable automatic updates and review them periodically.",
       tags=("patch",)),
    _c("net.backups", "network", "high",
       "احتفظ بنسخ احتياطية غير متصلة ومختبَرة",
       "Keep offline, tested backups",
       "النسخ الاحتياطية هي خط الدفاع ضد الفدية وتعطيل الخدمة.",
       "Backups are the line of defence against ransomware and denial-of-service.",
       "طبّق قاعدة 3-2-1، وافحص الاستعادة بين حين وآخر.",
       "Follow the 3-2-1 rule and test a restore from time to time.",
       tags=("backup", "dos", "ransomware")),
    _c("net.firewall", "network", "medium",
       "فعّل جدار الحماية على الجهاز والشبكة",
       "Enable the firewall on the host and the network",
       "جدار الحماية يحجب الاتصالات غير المطلوبة.",
       "A firewall blocks unsolicited inbound connections.",
       "فعّل جدار حماية النظام، ولا تفتح منافذ للخارج إلا عند الحاجة.",
       "Turn on the host firewall and don't forward ports unless needed.",
       tags=("network", "firewall")),
    _c("net.least_services", "network", "medium",
       "عطّل الخدمات والمنافذ غير المستخدمة (بما فيها UPnP)",
       "Disable unused services and ports (including UPnP)",
       "كل خدمة مفتوحة سطح هجوم إضافي؛ UPnP يفتح منافذ تلقائيًا.",
       "Every open service is extra attack surface; UPnP opens ports automatically.",
       "أغلق الخدمات غير اللازمة وعطّل UPnP على الراوتر ما لم تحتجه.",
       "Shut down unneeded services and disable UPnP on the router unless required.",
       tags=("network",)),
    _c("net.segment_iot", "network", "low",
       "افصل أجهزة إنترنت الأشياء في شبكة/‏VLAN خاصة",
       "Segment IoT devices onto their own VLAN/network",
       "عزل الأجهزة الضعيفة يمنع انتشار المهاجم.",
       "Isolating weak devices stops an attacker from pivoting.",
       "استخدم VLAN أو شبكة ضيوف مخصّصة لأجهزة IoT.",
       "Use a VLAN or a dedicated guest network for IoT devices.",
       tags=("network", "iot")),
]

_BY_ID = {c["id"]: c for c in CONTROLS}


def domains() -> list[dict]:
    return [{"key": k, "title": v,
             "controls": sum(1 for c in CONTROLS if c["domain"] == k)}
            for k, v in DOMAINS.items()]


def checklist(domain: str | None = None) -> list[dict]:
    items = [c for c in CONTROLS if domain is None or c["domain"] == domain]
    order = {"high": 0, "medium": 1, "low": 2}
    return sorted(items, key=lambda c: order.get(c["priority"], 9))


def assess(answers: dict | None) -> dict:
    """Score a self-assessment. `answers` maps control id → 'yes' (in place),
    'no' (missing) or 'unknown'. Unknown counts as not-in-place for the score
    but is listed separately so it is not mistaken for a confirmed gap."""
    answers = answers or {}
    total_w = done_w = 0
    missing, unknown, in_place = [], [], []
    order = {"high": 0, "medium": 1, "low": 2}
    for c in CONTROLS:
        w = _W.get(c["priority"], 1)
        total_w += w
        ans = str(answers.get(c["id"], "unknown")).lower()
        if ans == "yes":
            done_w += w
            in_place.append(c["id"])
        elif ans == "no":
            missing.append(c)
        else:
            unknown.append(c)
    score = round(done_w / total_w * 100) if total_w else 0
    label = "strong" if score >= 80 else ("moderate" if score >= 50 else "weak")
    missing.sort(key=lambda c: order.get(c["priority"], 9))
    unknown.sort(key=lambda c: order.get(c["priority"], 9))
    by_domain = {}
    for k in DOMAINS:
        dctrl = [c for c in CONTROLS if c["domain"] == k]
        ddone = sum(1 for c in dctrl if c["id"] in in_place)
        by_domain[k] = {"in_place": ddone, "total": len(dctrl)}
    return {
        "score": score, "label": label,
        "counts": {"in_place": len(in_place), "missing": len(missing),
                   "unknown": len(unknown), "total": len(CONTROLS)},
        "by_domain": by_domain,
        "missing": missing, "unknown": unknown,
        "note": {"ar": "تقييم ذاتي استرشادي لأصولك أنت؛ لا يفحص أي شبكة ولا يُغني عن المراجعة.",
                 "en": "A self-assessment of assets you own; it scans nothing and is advisory."},
    }


def recommend_for_findings(findings: list[dict], limit: int = 8) -> list[dict]:
    """Link real scan findings to the hardening controls that would reduce them,
    so the analyzer ends in concrete defensive actions. Matches on a finding's
    connector/tags/cwe keywords against each control's tags."""
    hay_terms = {
        "password": ("password", "credential", "secret", "auth"),
        "default-credentials": ("default", "credential"),
        "crypto": ("tls", "ssl", "cipher", "crypto", "certificate"),
        "patch": ("outdated", "version", "cve", "update", "dependency"),
        "network": ("port", "http", "header", "network", "exposure"),
        "firewall": ("port", "exposed", "open"),
        "auth": ("auth", "login", "session", "token"),
    }
    scored: dict[str, int] = {}
    for f in findings or []:
        blob = " ".join(str(f.get(k, "")) for k in
                        ("connector", "rule_id", "title", "cwe", "description")).lower()
        tags = [str(t).lower() for t in (f.get("tags") or [])]
        blob += " " + " ".join(tags)
        for c in CONTROLS:
            for tag in c["tags"]:
                terms = hay_terms.get(tag, (tag,))
                if any(term in blob for term in terms):
                    scored[c["id"]] = scored.get(c["id"], 0) + 1
                    break
    ranked = sorted(scored.items(),
                    key=lambda kv: (-kv[1], {"high": 0, "medium": 1, "low": 2}.get(
                        _BY_ID[kv[0]]["priority"], 9)))
    return [_BY_ID[cid] for cid, _ in ranked[:limit]]
