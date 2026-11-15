"""Classical ciphers and extra encodings — pure standard library.

Transforms (encrypt/decrypt) and codecs that the solver's breakers and the
``deep_analyze`` auto-cracker build on: affine, rail fence, Beaufort, Baconian,
a 5x5 Polybius square and ROT47, plus Base58, Ascii85/Base85, octal, A1Z26,
separator-delimited decimal and plain string reversal.

Like the rest of the toolkit these recover plaintext from WEAK, home-made or
legacy schemes for CTF practice and for assessing material you are authorized to
look at. They are not an attack on modern cryptography, and nothing here touches
a network or a shell. The score-driven BREAKERS live next to the other breakers
in ``solver.py``; this module holds only the reversible primitives they call.
"""
from __future__ import annotations

import base64
import re

_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


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


# ---------------------------------------------------------------------------
# ROT47 (its own inverse over the printable ASCII band 33..126)
# ---------------------------------------------------------------------------
def rot47(text: str) -> str:
    """Rotate visible ASCII by 47. Applying it twice returns the original."""
    out = []
    for ch in text:
        o = ord(ch)
        if 33 <= o <= 126:
            out.append(chr(33 + (o - 33 + 47) % 94))
        else:
            out.append(ch)
    return "".join(out)


def reverse_string(text) -> str:
    """Reverse a string (its own inverse)."""
    return _as_text(text)[::-1]


# ---------------------------------------------------------------------------
# Affine cipher:  E(x) = (a*x + b) mod 26,  a coprime to 26
# ---------------------------------------------------------------------------
def _gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a


def _modinv(a: int, m: int) -> int | None:
    a %= m
    for x in range(1, m):
        if (a * x) % m == 1:
            return x
    return None


# Multipliers coprime to 26 — the only valid affine 'a' values.
AFFINE_COEFFS = [a for a in range(1, 26) if _gcd(a, 26) == 1]


def affine_encrypt(text: str, a: int, b: int) -> str:
    if _gcd(a, 26) != 1:
        raise ValueError("affine 'a' must be coprime to 26")
    out = []
    for ch in text:
        if "A" <= ch <= "Z":
            out.append(chr((a * (ord(ch) - 65) + b) % 26 + 65))
        elif "a" <= ch <= "z":
            out.append(chr((a * (ord(ch) - 97) + b) % 26 + 97))
        else:
            out.append(ch)
    return "".join(out)


def affine_decrypt(text: str, a: int, b: int) -> str:
    ai = _modinv(a, 26)
    if ai is None:
        raise ValueError("affine 'a' must be coprime to 26")
    out = []
    for ch in text:
        if "A" <= ch <= "Z":
            out.append(chr(ai * (ord(ch) - 65 - b) % 26 + 65))
        elif "a" <= ch <= "z":
            out.append(chr(ai * (ord(ch) - 97 - b) % 26 + 97))
        else:
            out.append(ch)
    return "".join(out)


# ---------------------------------------------------------------------------
# Rail fence (zig-zag) transposition
# ---------------------------------------------------------------------------
def _rail_pattern(n: int, rails: int) -> list[int]:
    pattern, r, step = [], 0, 1
    for _ in range(n):
        pattern.append(r)
        if r == 0:
            step = 1
        elif r == rails - 1:
            step = -1
        r += step
    return pattern


def railfence_encrypt(text: str, rails: int) -> str:
    if rails <= 1 or rails >= len(text):
        return text
    rows: list[list[str]] = [[] for _ in range(rails)]
    for ch, r in zip(text, _rail_pattern(len(text), rails)):
        rows[r].append(ch)
    return "".join("".join(row) for row in rows)


def railfence_decrypt(cipher: str, rails: int) -> str:
    if rails <= 1 or rails >= len(cipher):
        return cipher
    pattern = _rail_pattern(len(cipher), rails)
    counts = [pattern.count(r) for r in range(rails)]
    rows, idx = [], 0
    for r in range(rails):
        rows.append(list(cipher[idx:idx + counts[r]]))
        idx += counts[r]
    pos = [0] * rails
    out = []
    for r in pattern:
        out.append(rows[r][pos[r]])
        pos[r] += 1
    return "".join(out)


# ---------------------------------------------------------------------------
# Beaufort cipher:  C = (K - P) mod 26.  It is its own inverse, so one keyed
# pass both encrypts and decrypts.
# ---------------------------------------------------------------------------
def beaufort_encrypt(text: str, key: str) -> str:
    letters = [k for k in key.upper() if k.isalpha()]
    if not letters:
        return text
    out, ki = [], 0
    for ch in text:
        if ch.isalpha():
            k = ord(letters[ki % len(letters)]) - 65
            base = 97 if ch.islower() else 65
            out.append(chr((k - (ord(ch) - base)) % 26 + base))
            ki += 1
        else:
            out.append(ch)
    return "".join(out)


def beaufort_decrypt(cipher: str, key: str) -> str:
    # Beaufort is an involution: decrypting is the same keyed operation.
    return beaufort_encrypt(cipher, key)


# ---------------------------------------------------------------------------
# Baconian cipher: each letter -> a 5-symbol group of two symbols (A/B).
# ---------------------------------------------------------------------------
def baconian_encode(text: str, symbols=("A", "B")) -> str:
    zero, one = symbols
    out = []
    for ch in text:
        if ch.isalpha():
            v = ord(ch.upper()) - 65
            out.append("".join(one if (v >> k) & 1 else zero for k in (4, 3, 2, 1, 0)))
    return "".join(out)


def baconian_decode(s) -> str | None:
    """Decode A/B groups to letters, tolerating a/b, 0/1 and mixed case."""
    bits = []
    for ch in _as_text(s):
        if ch in "Aa0":
            bits.append(0)
        elif ch in "Bb1":
            bits.append(1)
        elif ch.isspace():
            continue
        else:
            return None                     # a stray symbol: not Baconian
    if len(bits) < 5 or len(bits) % 5:
        return None
    letters = []
    for i in range(0, len(bits), 5):
        v = 0
        for bit in bits[i:i + 5]:
            v = (v << 1) | bit
        if v > 25:
            return None
        letters.append(chr(65 + v))
    return "".join(letters)


# ---------------------------------------------------------------------------
# Polybius square (5x5, I/J merged)
# ---------------------------------------------------------------------------
POLYBIUS_SQUARE = "ABCDEFGHIKLMNOPQRSTUVWXYZ"     # 25 letters, J folded onto I


def polybius_encode(text: str) -> str:
    out = []
    for ch in text:
        c = ch.upper()
        if c == "J":
            c = "I"
        if c in POLYBIUS_SQUARE:
            idx = POLYBIUS_SQUARE.index(c)
            out.append(f"{idx // 5 + 1}{idx % 5 + 1}")
    return "".join(out)


def polybius_decode(s) -> str | None:
    digits = [d for d in _as_text(s) if not d.isspace()]
    if len(digits) < 2 or len(digits) % 2 or any(d not in "12345" for d in digits):
        return None
    out = []
    for i in range(0, len(digits), 2):
        idx = (int(digits[i]) - 1) * 5 + (int(digits[i + 1]) - 1)
        out.append(POLYBIUS_SQUARE[idx])
    return "".join(out)


# ---------------------------------------------------------------------------
# Base58 (Bitcoin alphabet)
# ---------------------------------------------------------------------------
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def base58_encode(data) -> str:
    raw = _to_bytes(data)
    n = int.from_bytes(raw, "big") if raw else 0
    enc = ""
    while n > 0:
        n, r = divmod(n, 58)
        enc = BASE58_ALPHABET[r] + enc
    pad = 0
    for b in raw:
        if b == 0:
            pad += 1
        else:
            break
    return "1" * pad + enc


def base58_decode(s) -> bytes | None:
    t = _as_text(s).strip()
    if not t or any(ch not in BASE58_ALPHABET for ch in t):
        return None
    n = 0
    for ch in t:
        n = n * 58 + BASE58_ALPHABET.index(ch)
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    pad = 0
    for ch in t:
        if ch == "1":
            pad += 1
        else:
            break
    return b"\x00" * pad + body


# ---------------------------------------------------------------------------
# Ascii85 / Base85
# ---------------------------------------------------------------------------
def ascii85_encode(data) -> str:
    return base64.a85encode(_to_bytes(data)).decode("ascii")


def ascii85_decode(s) -> bytes | None:
    t = re.sub(r"\s", "", _as_text(s))
    if len(t) < 2:
        return None
    try:
        out = base64.a85decode(t)
    except Exception:
        return None
    return out or None


def base85_encode(data) -> str:
    return base64.b85encode(_to_bytes(data)).decode("ascii")


def base85_decode(s) -> bytes | None:
    t = re.sub(r"\s", "", _as_text(s))
    if len(t) < 2:
        return None
    try:
        out = base64.b85decode(t)
    except Exception:
        return None
    return out or None


# ---------------------------------------------------------------------------
# Octal bytes (whitespace/comma separated)
# ---------------------------------------------------------------------------
def octal_encode(data) -> str:
    return " ".join(format(b, "o") for b in _to_bytes(data))


def octal_decode(s) -> bytes | None:
    toks = [t for t in re.split(r"[,\s]+", _as_text(s).strip()) if t]
    if len(toks) < 2 or not all(re.fullmatch(r"[0-7]{1,3}", t) for t in toks):
        return None
    vals = [int(t, 8) for t in toks]
    if any(v > 255 for v in vals):
        return None
    return bytes(vals)


# ---------------------------------------------------------------------------
# A1Z26 (A=1 .. Z=26, separated by space / comma / dash)
# ---------------------------------------------------------------------------
def a1z26_encode(text, sep: str = " ") -> str:
    parts = [str(ord(ch.upper()) - 64) for ch in _as_text(text) if ch.isalpha()]
    return sep.join(parts)


def a1z26_decode(s) -> bytes | None:
    toks = [t for t in re.split(r"[,\s;/|-]+", _as_text(s).strip()) if t]
    if len(toks) < 2 or not all(re.fullmatch(r"\d{1,2}", t) for t in toks):
        return None
    vals = [int(t) for t in toks]
    if any(v < 1 or v > 26 for v in vals):
        return None
    return "".join(chr(64 + v) for v in vals).encode("ascii")


# ---------------------------------------------------------------------------
# Decimal bytes with a non-space / non-comma separator (; : | / -)
# ---------------------------------------------------------------------------
def decimal_sep_decode(s) -> bytes | None:
    t = _as_text(s).strip()
    if not re.search(r"[;:|/.\-]", t):
        return None                          # no special separator: not for us
    toks = [x for x in re.split(r"[;:|/.\s\-]+", t) if x]
    if len(toks) < 2 or not all(re.fullmatch(r"\d{1,7}", x) for x in toks):
        return None
    vals = [int(x) for x in toks]
    if any(v > 0x10FFFF for v in vals):
        return None
    if all(v <= 255 for v in vals):
        return bytes(vals)
    try:
        return "".join(chr(v) for v in vals).encode("utf-8")
    except ValueError:
        return None
