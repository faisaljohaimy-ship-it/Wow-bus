"""Cipher and encoding solver — pure standard library.

A toolbox of classical cryptanalysis: it decodes encoding chains (Base64/32/16,
hex, URL, binary, decimal, Morse) and breaks classical ciphers (Caesar,
Vigenere, single- and repeating-key XOR, monoalphabetic substitution) by
frequency analysis and hill-climbing, plus hash identification and a bounded
dictionary check.

These are standard tools for CTF/crypto challenges and for assessing weak,
home-made or legacy encodings in material you are authorized to look at. They
recover plaintext from WEAK schemes; they are not an attack on modern
cryptography. Nothing here contacts a network or runs a shell.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import random
import re
import string
import urllib.parse
from dataclasses import dataclass, field

from .data import MORSE_INV
from .scoring import (
    _ONLY_LETTERS,
    chi_squared,
    english_score,
    index_of_coincidence,
    TRIGRAM_SCORER,
    WORD_SCORER,
)


@dataclass
class Candidate:
    method: str
    text: str
    key: str = ""
    score: float = 0.0
    raw: bytes | None = None
    extra: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        d = {"method": self.method, "text": self.text, "key": self.key,
             "score": round(self.score, 4)}
        if self.extra:
            d["extra"] = self.extra
        return d


def _to_bytes(data) -> bytes:
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    return str(data).encode("utf-8", "replace")


def _as_text(data) -> str:
    if isinstance(data, (bytes, bytearray)):
        b = bytes(data)
        try:
            return b.decode("utf-8")
        except UnicodeDecodeError:
            return b.decode("latin-1", "replace")
    return str(data)


# Per-character weight for scoring candidate XOR/byte decryptions. Word hits do
# not help here (a column of a repeating-key XOR is not contiguous text), so we
# reward English letters and spaces and punish non-printable bytes — the classic
# single-byte-XOR fitness.
_CHAR_WEIGHT = {
    " ": 13.0, "e": 12.7, "t": 9.1, "a": 8.2, "o": 7.5, "i": 7.0, "n": 6.7,
    "s": 6.3, "h": 6.1, "r": 6.0, "d": 4.3, "l": 4.0, "u": 2.8, "c": 2.8,
    "m": 2.4, "w": 2.4, "f": 2.2, "g": 2.0, "y": 2.0, "p": 1.9, "b": 1.5,
    "v": 1.0, "k": 0.8, "j": 0.15, "x": 0.15, "q": 0.1, "z": 0.07,
}


def _byte_fitness(data: bytes) -> float:
    """Higher for byte strings that look like English text. Works on short,
    non-contiguous fragments where word-based scoring is useless."""
    if not data:
        return -1e9
    score = 0.0
    for ch in data:
        c = chr(ch).lower()
        if c in _CHAR_WEIGHT:
            score += _CHAR_WEIGHT[c]
        elif 32 <= ch < 127:
            score += 0.3                 # other printable ASCII
        elif ch in (9, 10, 13):
            score += 0.1                 # tab / newline
        else:
            score -= 20.0                # control or high byte: implausible
    return score / len(data)


# ---------------------------------------------------------------------------
# Simple letter transforms
# ---------------------------------------------------------------------------
def caesar_shift(text: str, n: int) -> str:
    """Shift letters by n (positive = forward). Case and punctuation kept."""
    out = []
    for ch in text:
        if "a" <= ch <= "z":
            out.append(chr((ord(ch) - 97 + n) % 26 + 97))
        elif "A" <= ch <= "Z":
            out.append(chr((ord(ch) - 65 + n) % 26 + 65))
        else:
            out.append(ch)
    return "".join(out)


def rot13(text: str) -> str:
    return caesar_shift(text, 13)


def atbash(text: str) -> str:
    out = []
    for ch in text:
        if "a" <= ch <= "z":
            out.append(chr(219 - ord(ch)))     # 'a'+'z' = 219
        elif "A" <= ch <= "Z":
            out.append(chr(155 - ord(ch)))     # 'A'+'Z' = 155
        else:
            out.append(ch)
    return "".join(out)


def caesar_break(ciphertext: str, top: int = 3) -> list[Candidate]:
    """All 26 shifts, ranked by letter-frequency chi-square (robust even with no
    dictionary words). Returns the best `top`."""
    cands = []
    for n in range(26):
        pt = caesar_shift(ciphertext, -n)
        cands.append((chi_squared(pt), Candidate(
            method="caesar", key=str(n), text=pt, score=english_score(pt))))
    cands.sort(key=lambda t: t[0])
    return [c for _, c in cands[:max(1, top)]]


# ---------------------------------------------------------------------------
# Vigenere
# ---------------------------------------------------------------------------
def vigenere_decrypt(ct: str, key: str) -> str:
    letters = [k for k in key.upper() if k.isalpha()]
    if not letters:
        return ct
    out, ki = [], 0
    for ch in ct:
        if ch.isalpha():
            k = ord(letters[ki % len(letters)]) - 65
            base = 97 if ch.islower() else 65
            out.append(chr((ord(ch) - base - k) % 26 + base))
            ki += 1
        else:
            out.append(ch)
    return "".join(out)


def vigenere_encrypt(pt: str, key: str) -> str:
    letters = [k for k in key.upper() if k.isalpha()]
    if not letters:
        return pt
    out, ki = [], 0
    for ch in pt:
        if ch.isalpha():
            k = ord(letters[ki % len(letters)]) - 65
            base = 97 if ch.islower() else 65
            out.append(chr((ord(ch) - base + k) % 26 + base))
            ki += 1
        else:
            out.append(ch)
    return "".join(out)


def _best_keylen(s: str, max_keylen: int) -> int:
    """Pick a Vigenere key length by the average index of coincidence of its
    columns. The shortest length whose columns look like natural language wins,
    so a true length is preferred over its multiples."""
    best_len, best_ic = 1, 0.0
    scored = []
    for klen in range(1, max_keylen + 1):
        cols = [s[i::klen] for i in range(klen)]
        ics = [index_of_coincidence(c) for c in cols if len(c) > 1]
        avg = sum(ics) / len(ics) if ics else 0.0
        scored.append((klen, avg))
        if avg > best_ic:
            best_ic, best_len = avg, klen
    for klen, avg in scored:                 # a clearly-English length, shortest first
        if avg >= 0.059:
            return klen
    return best_len


def vigenere_break(ciphertext: str, max_keylen: int = 16) -> Candidate:
    s = _ONLY_LETTERS.sub("", ciphertext.upper())
    if len(s) < 4:
        return Candidate(method="vigenere", key="", text=ciphertext,
                         score=english_score(ciphertext))
    klen = _best_keylen(s, max(1, min(max_keylen, len(s) // 2)))
    key = []
    for i in range(klen):
        col = s[i::klen]
        best_shift, best_chi = 0, 1e18
        for shift in range(26):
            dec = "".join(chr((ord(c) - 65 - shift) % 26 + 65) for c in col)
            x = chi_squared(dec)
            if x < best_chi:
                best_chi, best_shift = x, shift
        key.append(chr(best_shift + 65))
    key_s = "".join(key)
    pt = vigenere_decrypt(ciphertext, key_s)
    return Candidate(method="vigenere", key=key_s, text=pt, score=english_score(pt))


# ---------------------------------------------------------------------------
# XOR
# ---------------------------------------------------------------------------
def xor_bytes(data, key) -> bytes:
    data, key = _to_bytes(data), _to_bytes(key)
    if not key:
        return data
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def xor_single_break(data, top: int = 1) -> list[Candidate]:
    data = _to_bytes(data)
    scored = []
    for k in range(256):
        pt = bytes(b ^ k for b in data)
        scored.append((_byte_fitness(pt), k, pt))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [Candidate(method="xor_single", key=str(k), text=_as_text(pt),
                      score=english_score(pt), raw=pt)
            for _, k, pt in scored[:max(1, top)]]


def _hamming(a: bytes, b: bytes) -> int:
    return sum(bin(x ^ y).count("1") for x, y in zip(a, b))


def xor_repeating_break(data, max_keylen: int = 40) -> Candidate:
    data = _to_bytes(data)
    if len(data) < 4:
        return Candidate(method="xor_repeating", key="", text=_as_text(data),
                         score=english_score(data), raw=data)
    sizes = []
    upper = min(max_keylen, len(data) // 2)
    for ks in range(2, upper + 1):
        nblocks = min(8, len(data) // ks)
        blocks = [data[i * ks:(i + 1) * ks] for i in range(nblocks)]
        blocks = [b for b in blocks if len(b) == ks]
        if len(blocks) < 2:
            continue
        dists = [_hamming(blocks[i], blocks[j]) / ks
                 for i in range(len(blocks)) for j in range(i + 1, len(blocks))]
        sizes.append((sum(dists) / len(dists), ks))
    sizes.sort()
    best = None
    for _, ks in (sizes[:3] or [(0, 1)]):
        key = bytearray()
        for i in range(ks):
            col = data[i::ks]
            kb = int(xor_single_break(col, 1)[0].key)
            key.append(kb)
        key = _minimal_period(bytes(key))
        pt = xor_bytes(data, key)
        cand = Candidate(method="xor_repeating", key=key.hex(),
                         text=_as_text(pt), score=english_score(pt), raw=bytes(pt),
                         extra={"key_ascii": _as_text(key)})
        if best is None or cand.score > best.score:
            best = cand
    return best


def _minimal_period(key: bytes) -> bytes:
    """Reduce a key that is itself a repetition to its smallest unit, so a
    recovered 'KEYKEY' is reported as 'KEY'."""
    n = len(key)
    for d in range(1, n):
        if n % d == 0 and key == key[:d] * (n // d):
            return key[:d]
    return key


# ---------------------------------------------------------------------------
# Monoalphabetic substitution (hill-climbing on trigram fitness)
# ---------------------------------------------------------------------------
def _apply_sub(text: str, key: list[str]) -> str:
    out = []
    for ch in text:
        if "A" <= ch <= "Z":
            out.append(key[ord(ch) - 65])
        elif "a" <= ch <= "z":
            out.append(key[ord(ch) - 97].lower())
        else:
            out.append(ch)
    return "".join(out)


_ENGLISH_BY_FREQ = "ETAOINSHRDLCUMWFGYPBVKJXQZ"


def _frequency_seed_key(letters: str) -> list[str]:
    """A decryption key that maps the cipher's most frequent letter to E, its
    next to T, and so on. A strong starting point for the hill-climb."""
    from collections import Counter
    counts = Counter(letters)
    ranked = [c for c, _ in counts.most_common()]
    for c in string.ascii_uppercase:
        if c not in ranked:
            ranked.append(c)
    key = [""] * 26
    for i, cipher_letter in enumerate(ranked[:26]):
        key[ord(cipher_letter) - 65] = _ENGLISH_BY_FREQ[i]
    return key


def substitution_break(ciphertext: str, iterations: int = 7000,
                       restarts: int = 12, seed: int = 0) -> Candidate:
    letters = _ONLY_LETTERS.sub("", ciphertext.upper())
    if len(letters) < 20:
        return Candidate(method="substitution", key="",
                         text=ciphertext, score=english_score(ciphertext),
                         extra={"note": "ciphertext too short for substitution"})
    rng = random.Random(seed)
    fitness = WORD_SCORER.score              # per-word model, climbs reliably
    best_key, best_fit = list(string.ascii_uppercase), -1e18
    for restart in range(max(1, restarts)):
        key = _frequency_seed_key(letters) if restart == 0 else list(string.ascii_uppercase)
        if restart:
            rng.shuffle(key)
        fit = fitness(_apply_sub(ciphertext, key))
        stale = 0
        for _ in range(iterations):
            a, b = rng.randrange(26), rng.randrange(26)
            if a == b:
                continue
            key[a], key[b] = key[b], key[a]
            nfit = fitness(_apply_sub(ciphertext, key))
            if nfit > fit:
                fit = nfit
                stale = 0
            else:
                key[a], key[b] = key[b], key[a]
                stale += 1
                if stale > 1500:         # converged; stop early
                    break
        if fit > best_fit:
            best_fit, best_key = fit, key[:]
    pt = _apply_sub(ciphertext, best_key)
    mapping = {chr(65 + i): best_key[i] for i in range(26)}
    return Candidate(method="substitution", key="".join(best_key), text=pt,
                     score=english_score(pt), extra={"mapping": mapping})


# ---------------------------------------------------------------------------
# Encoding decoders — each returns bytes or None (None = does not apply)
# ---------------------------------------------------------------------------
def dec_base64(s) -> bytes | None:
    t = re.sub(r"\s", "", _as_text(s))
    if len(t) < 4 or not re.fullmatch(r"[A-Za-z0-9+/=]+", t):
        return None
    pad = (-len(t)) % 4
    try:
        out = base64.b64decode(t + "=" * pad)
    except (binascii.Error, ValueError):
        return None
    return out or None


def dec_base32(s) -> bytes | None:
    t = re.sub(r"\s", "", _as_text(s)).upper()
    if len(t) < 8 or not re.fullmatch(r"[A-Z2-7=]+", t):
        return None
    pad = (-len(t)) % 8
    try:
        out = base64.b32decode(t + "=" * pad)
    except (binascii.Error, ValueError):
        return None
    return out or None


def dec_hex(s) -> bytes | None:
    t = re.sub(r"[\s:]", "", _as_text(s))
    if t[:2].lower() == "0x":
        t = t[2:]
    if len(t) < 4 or len(t) % 2 or re.search(r"[^0-9a-fA-F]", t):
        return None
    try:
        return bytes.fromhex(t)
    except ValueError:
        return None


def dec_url(s) -> bytes | None:
    t = _as_text(s)
    if "%" not in t and "+" not in t:
        return None
    out = urllib.parse.unquote_to_bytes(t.replace("+", " "))
    return out if out != _to_bytes(s) else None


def dec_binary(s) -> bytes | None:
    t = re.sub(r"\s", "", _as_text(s))
    if len(t) < 8 or len(t) % 8 or set(t) - set("01"):
        return None
    try:
        return bytes(int(t[i:i + 8], 2) for i in range(0, len(t), 8))
    except ValueError:
        return None


def dec_decimal(s) -> bytes | None:
    parts = [p for p in re.split(r"[,\s]+", _as_text(s).strip()) if p]
    if len(parts) < 2 or not all(re.fullmatch(r"\d+", p) for p in parts):
        return None
    nums = [int(p) for p in parts]
    if any(n > 0x10FFFF for n in nums):
        return None
    if all(n <= 255 for n in nums):
        return bytes(nums)
    try:
        return "".join(chr(n) for n in nums).encode("utf-8")
    except ValueError:
        return None


def dec_morse(s) -> bytes | None:
    t = _as_text(s).strip()
    if not t or ("." not in t and "-" not in t) or set(t) - set(".-/ \n\t"):
        return None
    words = re.split(r"\s*/\s*|\s{2,}", t)
    decoded = []
    for w in words:
        chars = [MORSE_INV.get(tok) for tok in w.split()]
        if not chars or any(c is None for c in chars):
            return None
        decoded.append("".join(chars))
    return " ".join(decoded).encode("utf-8")


_DECODERS = [
    ("base64", dec_base64), ("base32", dec_base32), ("hex", dec_hex),
    ("url", dec_url), ("binary", dec_binary), ("decimal", dec_decimal),
    ("morse", dec_morse),
]


def decode_layer(data) -> list[tuple[str, bytes]]:
    """Every single-layer decoding that plausibly applies to `data`."""
    out = []
    for name, fn in _DECODERS:
        try:
            decoded = fn(data)
        except Exception:
            decoded = None
        if decoded:
            out.append((name, decoded))
    return out


def auto_decode(data, max_depth: int = 8, max_nodes: int = 500) -> dict:
    """Peel nested encoding layers, following whichever branch reads most like
    plaintext. Returns {"text", "chain", "score"} for the best result found."""
    start_text = _as_text(data)
    best = {"text": start_text, "chain": [], "score": english_score(start_text)}
    seen: set = set()
    nodes = [0]

    def rec(cur: bytes, chain: list[str], depth: int):
        text = _as_text(cur)
        sc = english_score(text)
        if sc > best["score"]:
            best.update(text=text, chain=list(chain), score=sc)
        if depth >= max_depth or nodes[0] >= max_nodes:
            return
        for name, decoded in decode_layer(cur):
            if not decoded or decoded == cur:
                continue
            fp = (name, bytes(decoded)[:64])
            if fp in seen:
                continue
            seen.add(fp)
            nodes[0] += 1
            if nodes[0] > max_nodes:
                return
            rec(bytes(decoded), chain + [name], depth + 1)

    rec(_to_bytes(data), [], 0)
    return best


# ---------------------------------------------------------------------------
# Hashes
# ---------------------------------------------------------------------------
_HASH_BY_LEN = {
    8: ["crc32", "adler32"], 16: ["mysql323"], 32: ["md5", "ntlm", "md4"],
    40: ["sha1", "ripemd160"], 56: ["sha224", "sha3_224"],
    64: ["sha256", "sha3_256", "blake2s"], 96: ["sha384", "sha3_384"],
    128: ["sha512", "sha3_512", "blake2b"],
}


def identify_hash(s: str) -> list[str]:
    s = s.strip()
    if re.fullmatch(r"\$2[aby]\$\d\d\$.{53}", s):
        return ["bcrypt"]
    if s.startswith("$argon2"):
        return ["argon2"]
    if s.startswith("$6$"):
        return ["sha512crypt"]
    if s.startswith("$5$"):
        return ["sha256crypt"]
    if s.startswith("$1$"):
        return ["md5crypt"]
    if re.fullmatch(r"[0-9a-fA-F]+", s):
        return list(_HASH_BY_LEN.get(len(s), []))
    return []


# Hashlib algorithms we will actually compute for the dictionary check.
_SAFE_ALGOS = ("md5", "sha1", "sha224", "sha256", "sha384", "sha512",
               "sha3_256", "sha3_512")


def dictionary_attack(target_hash: str, words, algos=_SAFE_ALGOS,
                      max_words: int = 200000) -> dict:
    """Hash each candidate word and compare to a target digest. Bounded by
    `max_words`; callers pass an explicit word list (the training lab passes its
    small bundled list). This recovers passwords behind WEAK unsalted hashes —
    for CTF practice and for assessing material you are authorized to test."""
    target = target_hash.strip().lower()
    algos = [a for a in algos if a in hashlib.algorithms_available]
    tried = 0
    for w in words:
        if tried >= max_words:
            break
        tried += 1
        wb = w.encode("utf-8", "replace") if isinstance(w, str) else bytes(w)
        for a in algos:
            try:
                if hashlib.new(a, wb).hexdigest().lower() == target:
                    word = w if isinstance(w, str) else bytes(w).decode("latin-1")
                    return {"found": True, "word": word, "algo": a, "tried": tried}
            except ValueError:
                continue
    return {"found": False, "tried": tried}


# ---------------------------------------------------------------------------
# One-call analysis used by the lab and the crypto connector
# ---------------------------------------------------------------------------
def analyze(data, max_keylen: int = 16) -> dict:
    """Best effort to recover readable text from an unknown weak scheme.

    Tries encoding chains first, then classical ciphers on the most text-like
    form. Returns a ranked list of candidate readings and the single best one.
    Pure analysis: no network, no shell, no mutation of any target.
    """
    candidates: list[Candidate] = []

    decoded = auto_decode(data)
    if decoded["chain"]:
        candidates.append(Candidate(method="decode:" + ">".join(decoded["chain"]),
                                    text=decoded["text"], score=decoded["score"]))
    working = decoded["text"] if decoded["chain"] else _as_text(data)

    letters = _ONLY_LETTERS.sub("", working.upper())
    if len(letters) >= 3:
        candidates.extend(caesar_break(working, top=2))
        candidates.append(vigenere_break(working, max_keylen=max_keylen))
    if len(letters) >= 40:
        candidates.append(substitution_break(working))

    raw = _to_bytes(data)
    if raw and max(raw) > 127 or (raw and english_score(working) < 0.25):
        candidates.extend(xor_single_break(raw, top=1))
        candidates.append(xor_repeating_break(raw, max_keylen=min(40, max_keylen * 2)))

    candidates.append(Candidate(method="raw", text=_as_text(data),
                                score=english_score(data)))
    candidates = [c for c in candidates if c is not None]
    candidates.sort(key=lambda c: c.score, reverse=True)
    best = candidates[0]
    return {
        "best": best.as_dict(),
        "readable": best.score >= 0.35,
        "candidates": [c.as_dict() for c in candidates[:6]],
    }
