"""Tests for the upgraded cipher engine: new classical ciphers (encrypt/decrypt
and automatic breakers), new encodings, and the deep_analyze auto-cracker.

Every breaker must actually recover known plaintext, and deep_analyze must crack
a mixed bag of schemes with no hint of the method used."""
import base64
import unittest

from app import crypto
from app.crypto import classic, solver

# A long, ordinary English passage — frequency analysis needs real text.
PLAIN = (
    "The quick brown fox jumps over the lazy dog while the other animals watch "
    "from the edge of the field and wonder what the morning will bring to them. "
    "We should not assume that every problem has a simple answer, because the "
    "world is full of cases where the first idea turns out to be wrong and a "
    "second look is needed before we can say that the work is really done."
)


class TestAffine(unittest.TestCase):
    def test_round_trip(self):
        for a, b in [(5, 8), (7, 3), (25, 0), (11, 17)]:
            ct = crypto.affine_encrypt(PLAIN, a, b)
            self.assertEqual(crypto.affine_decrypt(ct, a, b), PLAIN)

    def test_non_coprime_rejected(self):
        with self.assertRaises(ValueError):
            crypto.affine_encrypt("hello", 2, 1)       # 2 shares a factor with 26

    def test_break_recovers_plaintext(self):
        ct = crypto.affine_encrypt(PLAIN, 5, 8)
        cand = crypto.affine_break(ct)
        self.assertEqual(cand.text, PLAIN)
        self.assertEqual(cand.extra["a"], 5)
        self.assertEqual(cand.extra["b"], 8)


class TestRailFence(unittest.TestCase):
    def test_round_trip(self):
        for rails in range(2, 9):
            ct = crypto.railfence_encrypt(PLAIN, rails)
            self.assertEqual(crypto.railfence_decrypt(ct, rails), PLAIN)

    def test_known_vector(self):
        # Classic 3-rail example: WECRLTEERDSOEEFEAOCAIVDEN
        self.assertEqual(crypto.railfence_encrypt("WEAREDISCOVEREDFLEEATONCE", 3),
                         "WECRLTEERDSOEEFEAOCAIVDEN")

    def test_break_recovers_plaintext(self):
        ct = crypto.railfence_encrypt(PLAIN, 5)
        cand = crypto.railfence_break(ct)
        self.assertEqual(cand.text, PLAIN)
        self.assertEqual(cand.key, "5")


class TestBeaufort(unittest.TestCase):
    def test_is_its_own_inverse(self):
        ct = crypto.beaufort_encrypt(PLAIN, "SHIELD")
        self.assertEqual(crypto.beaufort_decrypt(ct, "SHIELD"), PLAIN)
        # decrypt == encrypt for Beaufort
        self.assertEqual(crypto.beaufort_encrypt(ct, "SHIELD"), PLAIN)

    def test_break_recovers_key_and_plaintext(self):
        ct = crypto.beaufort_encrypt(PLAIN, "SHIELD")
        cand = crypto.beaufort_break(ct, max_keylen=12)
        self.assertEqual(cand.key, "SHIELD")
        self.assertEqual(cand.text, PLAIN)


class TestBaconian(unittest.TestCase):
    def test_round_trip(self):
        self.assertEqual(crypto.baconian_decode(crypto.baconian_encode("ATTACKATDAWN")),
                         "ATTACKATDAWN")

    def test_tolerates_variants(self):
        enc = crypto.baconian_encode("HI")            # default A/B
        self.assertEqual(crypto.baconian_decode(enc.lower()), "HI")      # a/b
        bits = enc.replace("A", "0").replace("B", "1")
        self.assertEqual(crypto.baconian_decode(bits), "HI")            # 0/1
        spaced = " ".join(enc[i:i + 5] for i in range(0, len(enc), 5))
        self.assertEqual(crypto.baconian_decode(spaced), "HI")         # whitespace

    def test_rejects_non_baconian(self):
        self.assertIsNone(crypto.baconian_decode("hello world"))


class TestPolybius(unittest.TestCase):
    def test_round_trip(self):
        self.assertEqual(crypto.polybius_decode(crypto.polybius_encode("ATTACKATDAWN")),
                         "ATTACKATDAWN")

    def test_ij_merged(self):
        # J folds onto I, so JOIN encodes and decodes as IOIN.
        self.assertEqual(crypto.polybius_decode(crypto.polybius_encode("JOIN")), "IOIN")

    def test_rejects_non_polybius(self):
        self.assertIsNone(crypto.polybius_decode("12 67 89"))          # 6/7/8/9 invalid


class TestRot47AndReverse(unittest.TestCase):
    def test_rot47_is_its_own_inverse(self):
        self.assertEqual(crypto.rot47(crypto.rot47(PLAIN)), PLAIN)

    def test_rot47_known_vector(self):
        self.assertEqual(crypto.rot47("Hello, World!"), "w6==@[ (@C=5P")

    def test_reverse_is_its_own_inverse(self):
        self.assertEqual(crypto.reverse_string(crypto.reverse_string(PLAIN)), PLAIN)
        self.assertEqual(crypto.reverse_string("abc"), "cba")

    def test_atbash_rot13_still_work(self):
        self.assertEqual(crypto.atbash(crypto.atbash(PLAIN)), PLAIN)
        self.assertEqual(crypto.rot13(crypto.rot13(PLAIN)), PLAIN)


class TestNewEncodings(unittest.TestCase):
    def test_base58_round_trip(self):
        self.assertEqual(crypto.base58_decode(crypto.base58_encode(b"hello world")),
                         b"hello world")
        # leading zero bytes survive as leading '1's
        self.assertEqual(crypto.base58_decode(crypto.base58_encode(b"\x00\x00ab")),
                         b"\x00\x00ab")

    def test_base58_known_vector(self):
        self.assertEqual(crypto.base58_encode(b"Hello World!"), "2NEpo7TZRRrLZSi2U")

    def test_base58_rejects_bad_alphabet(self):
        self.assertIsNone(crypto.base58_decode("0OIl"))                # excluded chars

    def test_ascii85_round_trip(self):
        self.assertEqual(crypto.ascii85_decode(crypto.ascii85_encode(b"attack at dawn")),
                         b"attack at dawn")

    def test_base85_round_trip(self):
        self.assertEqual(crypto.base85_decode(crypto.base85_encode(b"attack at dawn")),
                         b"attack at dawn")

    def test_octal_round_trip(self):
        self.assertEqual(crypto.octal_decode(crypto.octal_encode(b"Hi there")), b"Hi there")
        self.assertEqual(crypto.octal_decode("110 151"), b"Hi")

    def test_a1z26_round_trip(self):
        self.assertEqual(crypto.a1z26_decode(crypto.a1z26_encode("HELLO")), b"HELLO")
        self.assertEqual(crypto.a1z26_decode("1,20,20,1,3,11"), b"ATTACK")
        self.assertIsNone(crypto.a1z26_decode("5 99"))                 # 99 out of range

    def test_decimal_sep_decode(self):
        self.assertEqual(crypto.decimal_sep_decode("72;105;33"), b"Hi!")
        self.assertEqual(crypto.decimal_sep_decode("104|105"), b"hi")
        self.assertIsNone(crypto.decimal_sep_decode("72 105"))         # plain decimal

    def test_new_decoders_are_wired_into_auto_decode(self):
        # Each gated decoder appears as a layer when it genuinely applies.
        for text, name in [
            (crypto.octal_encode(b"attack at dawn"), "octal"),
            (crypto.base58_encode(b"attack at dawn"), "base58"),
            (crypto.a1z26_encode("ATTACK"), "a1z26"),
            ("97;116;116;97;99;107", "decimal_sep"),
        ]:
            names = [n for n, _ in solver.decode_layer(text)]
            self.assertIn(name, names, f"{name} not offered for {text!r}")

    def test_auto_decode_base58_layer(self):
        out = crypto.auto_decode(crypto.base58_encode(b"attack at dawn"))
        self.assertEqual(out["text"], "attack at dawn")
        self.assertIn("base58", out["chain"])


class TestDeepAnalyze(unittest.TestCase):
    """The headline auto-cracker must solve a mixed bag with no hint of method."""

    def _crack(self, ciphertext):
        r = crypto.deep_analyze(ciphertext)
        for key in ("best", "readable", "candidates", "steps"):
            self.assertIn(key, r)
        for key in ("method", "text", "key", "score"):
            self.assertIn(key, r["best"])
        self.assertLessEqual(len(r["candidates"]), 8)
        return r

    def test_solves_base64_blob(self):
        r = self._crack(base64.b64encode(PLAIN.encode()).decode())
        self.assertTrue(r["readable"])
        self.assertEqual(r["best"]["text"], PLAIN)

    def test_solves_caesar(self):
        r = self._crack(crypto.caesar_shift(PLAIN, 11))
        self.assertTrue(r["readable"])
        self.assertEqual(r["best"]["text"], PLAIN)

    def test_solves_vigenere(self):
        r = self._crack(crypto.vigenere_encrypt(PLAIN, "SECRET"))
        self.assertTrue(r["readable"])
        self.assertEqual(r["best"]["text"], PLAIN)

    def test_solves_affine(self):
        r = self._crack(crypto.affine_encrypt(PLAIN, 5, 8))
        self.assertTrue(r["readable"])
        self.assertEqual(r["best"]["text"], PLAIN)

    def test_solves_railfence(self):
        r = self._crack(crypto.railfence_encrypt(PLAIN, 4))
        self.assertTrue(r["readable"])
        self.assertEqual(r["best"]["text"], PLAIN)

    def test_solves_repeating_key_xor_hex(self):
        ct = crypto.xor_bytes(PLAIN.encode(), b"KEY").hex()
        r = self._crack(ct)
        self.assertTrue(r["readable"])
        self.assertEqual(r["best"]["text"], PLAIN)

    def test_solves_beaufort(self):
        r = self._crack(crypto.beaufort_encrypt(PLAIN, "SHIELD"))
        self.assertTrue(r["readable"])
        self.assertEqual(r["best"]["text"], PLAIN)

    def test_reports_steps(self):
        r = crypto.deep_analyze(crypto.caesar_shift(PLAIN, 3))
        self.assertTrue(r["steps"])
        self.assertTrue(all(isinstance(s, str) for s in r["steps"]))

    def test_candidates_ranked_by_score(self):
        r = crypto.deep_analyze(crypto.affine_encrypt(PLAIN, 7, 3))
        scores = [c["score"] for c in r["candidates"]]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertEqual(r["best"]["score"], scores[0])


class TestApiIntact(unittest.TestCase):
    """Backward compatibility: every documented public name is still exported."""

    def test_existing_names_present(self):
        for name in ("analyze", "auto_decode", "caesar_break", "vigenere_break",
                     "xor_single_break", "xor_repeating_break", "substitution_break",
                     "dictionary_attack", "identify_hash", "english_score",
                     "chi_squared", "index_of_coincidence", "word_hits",
                     "caesar_shift", "rot13", "atbash"):
            self.assertTrue(hasattr(crypto, name), name)

    def test_analyze_shape_unchanged(self):
        out = crypto.analyze(base64.b64encode(b"hello there friend").decode())
        self.assertEqual(set(out), {"best", "readable", "candidates"})
        self.assertEqual(set(out["best"]) >= {"method", "text", "key", "score"}, True)

    def test_new_names_present(self):
        for name in ("deep_analyze", "affine_encrypt", "affine_decrypt", "affine_break",
                     "railfence_encrypt", "railfence_decrypt", "railfence_break",
                     "beaufort_encrypt", "beaufort_decrypt", "beaufort_break",
                     "baconian_encode", "baconian_decode", "polybius_encode",
                     "polybius_decode", "rot47", "reverse_string", "base58_encode",
                     "base58_decode", "ascii85_encode", "ascii85_decode",
                     "base85_encode", "base85_decode", "octal_encode", "octal_decode",
                     "a1z26_encode", "a1z26_decode", "decimal_sep_decode"):
            self.assertTrue(hasattr(crypto, name), name)


if __name__ == "__main__":
    unittest.main()
