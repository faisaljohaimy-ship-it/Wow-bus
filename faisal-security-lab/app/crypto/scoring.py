"""Fitness functions for cryptanalysis — standard-library only.

These are the scorers the cipher breakers use to recognise plausible English
plaintext among many candidate decryptions: letter-frequency chi-square, an
n-gram log-probability model, index of coincidence and common-word hits. They
are ordinary frequency-analysis aids, used for CTF challenges and for judging
weak or home-made encodings in material you are authorized to assess.
"""
from __future__ import annotations

import math
import re
from collections import Counter

from .data import COMMON_WORDS, ENGLISH_FREQ, TRIGRAMS
from .words import WORDS_RANKED

_ONLY_LETTERS = re.compile(r"[^A-Z]")
_WORD = re.compile(r"[a-z]+")
_WORDS_UPPER = re.compile(r"[A-Z]+")
_PRINTABLE = set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    " \t\n\r.,;:!?'\"()[]{}<>-_/\\@#$%^&*+=|~`"
)


class NgramScorer:
    """Log-probability of a text under an n-gram frequency table.

    score() returns a sum of log10 probabilities (always negative; higher, i.e.
    closer to zero, is more English-like). Unseen n-grams get a small floor so a
    single odd trigram does not veto an otherwise-good candidate.
    """

    def __init__(self, counts: dict[str, int]):
        self.n = len(next(iter(counts)))
        total = float(sum(counts.values()))
        self.logs = {g: math.log10(c / total) for g, c in counts.items()}
        self.floor = math.log10(0.01 / total)

    def score(self, text: str) -> float:
        s = _ONLY_LETTERS.sub("", text.upper())
        n = self.n
        if len(s) < n:
            return self.floor * 10
        logs = self.logs
        floor = self.floor
        return sum(logs.get(s[i:i + n], floor) for i in range(len(s) - n + 1))

    def average(self, text: str) -> float:
        """score() per n-gram, so texts of different lengths compare fairly."""
        s = _ONLY_LETTERS.sub("", text.upper())
        count = len(s) - self.n + 1
        if count <= 0:
            return self.floor
        return self.score(text) / count


TRIGRAM_SCORER = NgramScorer(TRIGRAMS)


class WordScorer:
    """Per-word English fitness for the substitution breaker.

    A plain cross-boundary n-gram model is too sparse to climb out of local
    optima on a monoalphabetic substitution. This instead scores each word of a
    candidate plaintext on its own, with an intra-word trigram model learnt from
    a ranked common-word list (weighted so frequent words count for more) plus a
    bonus when the word is a real one. It drives the hill-climb reliably to the
    correct key on normal English of a few hundred letters.
    """

    def __init__(self, ranked_words, word_bonus: float = 3.0):
        self.word_bonus = word_bonus
        self.wordset = frozenset(w.upper() for w in ranked_words)
        counts: dict[str, int] = {}
        for rank, w in enumerate(ranked_words):
            wu = w.upper()
            weight = max(1, round(1_000_000 / (rank + 1)))
            for i in range(len(wu) - 2):
                tri = wu[i:i + 3]
                counts[tri] = counts.get(tri, 0) + weight
        total = float(sum(counts.values())) or 1.0
        self.logs = {g: math.log10(c / total) for g, c in counts.items()}
        self.floor = math.log10(0.01 / total)

    def score(self, text: str) -> float:
        total = 0.0
        logs = self.logs
        floor = self.floor
        for w in _WORDS_UPPER.findall(text.upper()):
            if len(w) >= 3:
                total += sum(logs.get(w[i:i + 3], floor) for i in range(len(w) - 2))
            else:
                total += floor * len(w)
            if w in self.wordset:
                total += self.word_bonus
        return total


WORD_SCORER = WordScorer(WORDS_RANKED)


def chi_squared(text: str) -> float:
    """Chi-square distance of a text's letter distribution from English.

    Lower is more English-like. The workhorse for breaking Caesar shifts and the
    columns of a Vigenere cipher, where letter frequency alone is decisive.
    """
    s = _ONLY_LETTERS.sub("", text.upper())
    n = len(s)
    if n == 0:
        return 1e9
    counts = Counter(s)
    chi = 0.0
    for c, freq in ENGLISH_FREQ.items():
        expected = n * freq / 100.0
        diff = counts.get(c, 0) - expected
        chi += diff * diff / expected
    return chi


def index_of_coincidence(text: str) -> float:
    """Probability that two random letters of the text are equal (~0.0667 for
    English, ~0.0385 for uniform). Used to estimate a Vigenere key length."""
    s = _ONLY_LETTERS.sub("", text.upper())
    n = len(s)
    if n < 2:
        return 0.0
    counts = Counter(s)
    return sum(v * (v - 1) for v in counts.values()) / (n * (n - 1))


def _as_text(data) -> str:
    if isinstance(data, (bytes, bytearray)):
        try:
            return bytes(data).decode("utf-8")
        except UnicodeDecodeError:
            return bytes(data).decode("latin-1", "replace")
    return str(data)


def printable_ratio(data) -> float:
    text = _as_text(data)
    if not text:
        return 0.0
    return sum(1 for ch in text if ch in _PRINTABLE) / len(text)


def word_hits(data) -> float:
    text = _as_text(data).lower()
    words = _WORD.findall(text)
    if not words:
        return 0.0
    return sum(1 for w in words if w in COMMON_WORDS) / len(words)


def english_score(data) -> float:
    """A 0..1 readability score blending printable ratio, letter/space ratio,
    common-word hits and the normalised trigram model. Used to rank candidate
    decryptions across different methods and to decide when auto-decoding has
    reached plausible plaintext."""
    text = _as_text(data)
    if not text:
        return 0.0
    pr = printable_ratio(text)
    letters = sum(1 for ch in text if ch.isalpha() or ch == " ")
    lr = letters / len(text)
    wr = word_hits(text)
    avg = TRIGRAM_SCORER.average(text)       # ~ -1.5 (English) .. -5 (noise)
    tg = max(0.0, min(1.0, (avg + 5.0) / 3.5))
    return round(0.20 * pr + 0.20 * lr + 0.40 * wr + 0.20 * tg, 4)
