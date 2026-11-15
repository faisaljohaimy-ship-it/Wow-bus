"""Cryptanalysis toolkit (standard library only).

Decodes encoding chains and breaks classical/weak ciphers by frequency analysis
and hill-climbing, identifies hashes and runs a bounded dictionary check. Built
for CTF/crypto practice in the training lab and for judging weak or home-made
encodings in material you are authorized to assess. It recovers plaintext from
WEAK schemes only; it is not an attack on modern cryptography, and it never
touches a network or a shell.
"""
from .scoring import (
    chi_squared,
    english_score,
    index_of_coincidence,
    word_hits,
)
from .solver import (
    Candidate,
    analyze,
    atbash,
    auto_decode,
    caesar_break,
    caesar_shift,
    decode_layer,
    dictionary_attack,
    identify_hash,
    rot13,
    substitution_break,
    vigenere_break,
    vigenere_decrypt,
    vigenere_encrypt,
    xor_bytes,
    xor_repeating_break,
    xor_single_break,
)

__all__ = [
    "Candidate", "analyze", "atbash", "auto_decode", "caesar_break",
    "caesar_shift", "chi_squared", "decode_layer", "dictionary_attack",
    "english_score", "identify_hash", "index_of_coincidence", "rot13",
    "substitution_break", "vigenere_break", "vigenere_decrypt",
    "vigenere_encrypt", "word_hits", "xor_bytes", "xor_repeating_break",
    "xor_single_break",
]
