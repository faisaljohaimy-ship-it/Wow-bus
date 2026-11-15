"""Built-in crypto challenges for the training lab.

Every challenge is self-contained: a piece of ciphertext (or a weak hash) with a
known answer, generated here from its plaintext so the displayed challenge and
the solver can never drift apart. The solver uses the standard-library crypto
engine. Nothing here touches a network, a shell or any target outside this file
— it is the safe place the offensive cipher code runs, on built-in material
only.
"""
from __future__ import annotations

import base64
import difflib
import hashlib
import re

from .. import crypto
from ..crypto.data import MORSE
from .passwords import LAB_PASSWORDS


# --- encoders used only to build the challenge text -------------------------
def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


def _hex(s: str) -> str:
    return s.encode().hex()


def _binary(s: str) -> str:
    return " ".join(format(b, "08b") for b in s.encode())


def _morse(s: str) -> str:
    words = s.upper().split()
    return " / ".join(" ".join(MORSE[ch] for ch in w if ch in MORSE) for w in words)


def _xor_hex(s: str, key: str) -> str:
    return crypto.xor_bytes(s.encode(), key.encode()).hex()


def _sub_encrypt(s: str, mapping: dict) -> str:
    return "".join(mapping.get(ch.upper(), ch) if ch.isalpha() else ch for ch in s)


# A fixed substitution alphabet (plain A..Z -> cipher), for the challenge only.
_SUB_CIPHER = "QWERTYUIOPASDFGHJKLZXCVBNM"
_SUB_MAP = {chr(65 + i): _SUB_CIPHER[i] for i in range(26)}


# --- the challenges ---------------------------------------------------------
# kind drives both generation and solving. plaintext is the answer (hidden from
# the player until solved); for a hash challenge it is the password behind it.
_RAW = [
    {"id": "enc-base64", "kind": "encoding", "points": 10,
     "title_en": "Base64", "title_ar": "ترميز Base64",
     "hint_en": "A very common way to carry text as letters, digits, + and /.",
     "hint_ar": "طريقة شائعة جدًا لنقل النص بالحروف والأرقام و + و /.",
     "plaintext": "welcome to the security lab",
     "make": lambda p: _b64(p)},
    {"id": "enc-hex", "kind": "encoding", "points": 10,
     "title_en": "Hexadecimal", "title_ar": "ترميز ست عشري",
     "hint_en": "Each byte written as two hex digits.",
     "hint_ar": "كل بايت مكتوب برقمين ست عشريين.",
     "plaintext": "the flag is hidden in plain sight",
     "make": lambda p: _hex(p)},
    {"id": "enc-binary", "kind": "encoding", "points": 10,
     "title_en": "Binary", "title_ar": "ثنائي",
     "hint_en": "Ones and zeroes, eight to a byte.",
     "hint_ar": "أصفار وآحاد، ثمانية لكل بايت.",
     "plaintext": "binary is easy to read",
     "make": lambda p: _binary(p)},
    {"id": "enc-morse", "kind": "encoding", "points": 15,
     "title_en": "Morse code", "title_ar": "شيفرة مورس",
     "hint_en": "Dots and dashes; / separates words.",
     "hint_ar": "نقاط وشرطات؛ / تفصل بين الكلمات.",
     "plaintext": "SOS FIND THE KEY",
     "make": lambda p: _morse(p)},
    {"id": "enc-chain", "kind": "encoding", "points": 20,
     "title_en": "Nested encoding", "title_ar": "ترميز متداخل",
     "hint_en": "One encoding wrapped inside another. Peel both.",
     "hint_ar": "ترميز داخل ترميز آخر. انزع الطبقتين.",
     "plaintext": "two layers deep",
     "make": lambda p: _b64(_hex(p))},
    {"id": "cae-caesar", "kind": "caesar", "points": 15,
     "title_en": "Caesar shift", "title_ar": "إزاحة قيصر",
     "hint_en": "Every letter moved by the same amount around the alphabet.",
     "hint_ar": "كل حرف مُزاح بنفس المقدار في الأبجدية.",
     "plaintext": "the oldest cipher still teaches the newest lesson about keys",
     "make": lambda p: crypto.caesar_shift(p, 7)},
    {"id": "vig-vigenere", "kind": "vigenere", "points": 25,
     "title_en": "Vigenere", "title_ar": "شيفرة فيجنر",
     "hint_en": "A repeating keyword shifts the letters. Frequency gives it away.",
     "hint_ar": "كلمة مفتاح متكررة تُزيح الحروف. التحليل الترددي يكشفها.",
     "plaintext": ("we hold that strong systems are built by people who check their "
                   "work and share what they learn with the whole team every day"),
     "make": lambda p: crypto.vigenere_encrypt(p, "SHIELD")},
    {"id": "xor-single", "kind": "xor_single", "points": 20,
     "title_en": "Single-byte XOR", "title_ar": "XOR ببايت واحد",
     "hint_en": "The whole message XORed with one secret byte.",
     "hint_ar": "الرسالة كلها XOR مع بايت سري واحد.",
     "plaintext": "a single byte is never enough to hide a message",
     "make": lambda p: _xor_hex(p, "\x5a")},
    {"id": "xor-repeating", "kind": "xor_repeating", "points": 30,
     "title_en": "Repeating-key XOR", "title_ar": "XOR بمفتاح متكرر",
     "hint_en": "A short keyword repeated and XORed over the text.",
     "hint_ar": "كلمة مفتاح قصيرة مكررة عبر النص بعملية XOR.",
     "plaintext": ("this is the classic challenge where you find the key length "
                   "first and then solve each column on its own as a single byte"),
     "make": lambda p: _xor_hex(p, "LAB")},
    {"id": "sub-substitution", "kind": "substitution", "points": 35,
     "title_en": "Substitution", "title_ar": "استبدال أحادي",
     "hint_en": "Each letter maps to a fixed other letter. Frequency and words "
                "recover it.",
     "hint_ar": "كل حرف يقابله حرف ثابت آخر. يُستعاد بالتردد والكلمات.",
     "plaintext": ("the quick brown fox jumps over the lazy dog while the other "
                   "animals watch from the edge of the quiet field and wonder what "
                   "the long morning will finally bring to all of them today"),
     "make": lambda p: _sub_encrypt(p, _SUB_MAP)},
    {"id": "hash-md5", "kind": "hash", "points": 20,
     "title_en": "Weak hash", "title_ar": "تجزئة ضعيفة",
     "hint_en": "An unsalted MD5 of a very common password.",
     "hint_ar": "MD5 بلا ملح لكلمة مرور شائعة جدًا.",
     "plaintext": "letmein",
     "make": lambda p: hashlib.md5(p.encode()).hexdigest()},
]

# Freeze the generated ciphertext onto each challenge.
CHALLENGES = []
for _c in _RAW:
    _d = dict(_c)
    _d["ciphertext"] = _c["make"](_c["plaintext"])
    del _d["make"]
    CHALLENGES.append(_d)
_BY_ID = {c["id"]: c for c in CHALLENGES}


def _norm(s) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def list_challenges(reveal: bool = False) -> list[dict]:
    """Challenge metadata for the UI. The answer is withheld unless reveal."""
    out = []
    for c in CHALLENGES:
        row = {k: c[k] for k in ("id", "kind", "points", "title_en", "title_ar",
                                 "hint_en", "hint_ar", "ciphertext")}
        if reveal:
            row["plaintext"] = c["plaintext"]
        out.append(row)
    return out


def solve(challenge_id: str) -> dict:
    """Run the crypto engine against one challenge and report the result."""
    ch = _BY_ID.get(challenge_id)
    if not ch:
        return {"error": "unknown challenge"}
    kind, ct, expected = ch["kind"], ch["ciphertext"], ch["plaintext"]
    recovered, key, method = "", "", kind
    if kind == "encoding":
        r = crypto.auto_decode(ct)
        recovered, method = r["text"], "decode:" + ">".join(r["chain"] or ["none"])
    elif kind == "caesar":
        c = crypto.caesar_break(ct, 1)[0]
        recovered, key = c.text, c.key
    elif kind == "vigenere":
        c = crypto.vigenere_break(ct, 16)
        recovered, key = c.text, c.key
    elif kind == "xor_single":
        c = crypto.xor_single_break(bytes.fromhex(ct), 1)[0]
        recovered, key = c.text, c.key
    elif kind == "xor_repeating":
        c = crypto.xor_repeating_break(bytes.fromhex(ct))
        recovered, key = c.text, c.extra.get("key_ascii", c.key)
    elif kind == "substitution":
        c = crypto.substitution_break(ct)
        recovered, key = c.text, c.key
    elif kind == "hash":
        res = crypto.dictionary_attack(ct, LAB_PASSWORDS)
        recovered = res.get("word", "")
        key, method = res.get("algo", ""), "dictionary"
    solved = _is_recovered(recovered, expected, kind)
    return {"id": challenge_id, "kind": kind, "method": method, "key": key,
            "recovered": recovered, "expected": expected, "solved": solved,
            "points": ch["points"] if solved else 0}


def _is_recovered(recovered: str, expected: str, kind: str) -> bool:
    """Whether a solve counts. Exact for hashes; for the ciphers, a very close
    reading counts — the substitution breaker is heuristic and may leave a rare
    letter wrong without hurting the recovered message."""
    rn, en = _norm(recovered), _norm(expected)
    if not rn:
        return False
    if kind == "hash":
        return rn == en
    if en in rn or rn == en:
        return True
    return difflib.SequenceMatcher(None, rn, en).ratio() >= 0.9


def grade_attempt(challenge_id: str, answer: str) -> dict:
    """Check a player's own answer against the known plaintext."""
    ch = _BY_ID.get(challenge_id)
    if not ch:
        return {"error": "unknown challenge"}
    correct = _norm(answer) == _norm(ch["plaintext"]) or (
        len(_norm(answer)) >= 4 and _norm(answer) in _norm(ch["plaintext"]))
    return {"id": challenge_id, "correct": correct,
            "points": ch["points"] if correct else 0}


def solve_all() -> dict:
    """Solve every challenge — the lab's self-check and capability showcase."""
    results = [solve(c["id"]) for c in CHALLENGES]
    return {"total": len(results),
            "solved": sum(1 for r in results if r["solved"]),
            "points": sum(r["points"] for r in results),
            "results": results}
