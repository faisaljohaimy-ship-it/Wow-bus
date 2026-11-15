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
from .classic import (
    a1z26_decode,
    a1z26_encode,
    affine_decrypt,
    affine_encrypt,
    ascii85_decode,
    ascii85_encode,
    baconian_decode,
    baconian_encode,
    base58_decode,
    base58_encode,
    base85_decode,
    base85_encode,
    beaufort_decrypt,
    beaufort_encrypt,
    decimal_sep_decode,
    octal_decode,
    octal_encode,
    polybius_decode,
    polybius_encode,
    railfence_decrypt,
    railfence_encrypt,
    reverse_string,
    rot47,
)
from .solver import (
    Candidate,
    affine_break,
    analyze,
    atbash,
    auto_decode,
    beaufort_break,
    caesar_break,
    caesar_shift,
    decode_layer,
    deep_analyze,
    dictionary_attack,
    identify_hash,
    railfence_break,
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
    # cipher engine, upgraded: classical ciphers, more codecs, deep auto-cracker
    "deep_analyze",
    "affine_encrypt", "affine_decrypt", "affine_break",
    "railfence_encrypt", "railfence_decrypt", "railfence_break",
    "beaufort_encrypt", "beaufort_decrypt", "beaufort_break",
    "baconian_encode", "baconian_decode",
    "polybius_encode", "polybius_decode",
    "rot47", "reverse_string",
    "base58_encode", "base58_decode",
    "ascii85_encode", "ascii85_decode", "base85_encode", "base85_decode",
    "octal_encode", "octal_decode",
    "a1z26_encode", "a1z26_decode", "decimal_sep_decode",
]
