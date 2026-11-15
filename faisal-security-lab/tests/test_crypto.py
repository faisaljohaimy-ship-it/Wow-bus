"""Tests for the cryptanalysis toolkit: the breakers must actually recover
known plaintext, not merely run."""
import hashlib
import unittest

from app import crypto
from app.crypto import solver

# A long, ordinary English passage: frequency analysis needs real text.
PLAIN = (
    "The quick brown fox jumps over the lazy dog while the other animals watch "
    "from the edge of the field and wonder what the morning will bring to them. "
    "We should not assume that every problem has a simple answer, because the "
    "world is full of cases where the first idea turns out to be wrong and a "
    "second look is needed before we can say that the work is really done."
)


class TestTransforms(unittest.TestCase):
    def test_caesar_shift_round_trip(self):
        self.assertEqual(solver.caesar_shift("Hello, World!", 3), "Khoor, Zruog!")
        self.assertEqual(solver.caesar_shift("Khoor, Zruog!", -3), "Hello, World!")

    def test_rot13_is_its_own_inverse(self):
        self.assertEqual(crypto.rot13(crypto.rot13(PLAIN)), PLAIN)

    def test_atbash_is_its_own_inverse(self):
        self.assertEqual(crypto.atbash("Attack At Dawn"), "Zggzxp Zg Wzdm")
        self.assertEqual(crypto.atbash(crypto.atbash(PLAIN)), PLAIN)


class TestEncodings(unittest.TestCase):
    def test_base64_roundtrip_and_auto(self):
        import base64
        enc = base64.b64encode(b"secret message here").decode()
        self.assertEqual(solver.dec_base64(enc), b"secret message here")
        out = crypto.auto_decode(enc)
        self.assertEqual(out["text"], "secret message here")
        self.assertIn("base64", out["chain"])

    def test_hex_binary_decimal_morse(self):
        self.assertEqual(solver.dec_hex("48656c6c6f"), b"Hello")
        self.assertEqual(solver.dec_binary("0100100001101001"), b"Hi")
        self.assertEqual(solver.dec_decimal("72 105"), b"Hi")
        self.assertEqual(solver.dec_morse(".... .. / - .... . .-. ."), b"HI THERE")

    def test_nested_encoding_chain(self):
        import base64
        inner = "attack at dawn"
        layer1 = inner.encode().hex()                       # hex
        layer2 = base64.b64encode(layer1.encode()).decode()  # base64 of the hex
        out = crypto.auto_decode(layer2)
        self.assertEqual(out["text"], inner)
        self.assertEqual(out["chain"], ["base64", "hex"])


class TestClassicalCiphers(unittest.TestCase):
    def test_caesar_break(self):
        ct = solver.caesar_shift(PLAIN, 7)
        best = crypto.caesar_break(ct, top=1)[0]
        self.assertEqual(best.text, PLAIN)
        self.assertEqual(best.key, "7")

    def test_vigenere_break(self):
        key = "SECRET"
        ct = crypto.vigenere_encrypt(PLAIN, key)
        cand = crypto.vigenere_break(ct, max_keylen=12)
        self.assertEqual(cand.key, key)
        self.assertEqual(cand.text, PLAIN)

    def test_vigenere_round_trip(self):
        ct = crypto.vigenere_encrypt("Meet me at noon.", "KEY")
        self.assertEqual(crypto.vigenere_decrypt(ct, "KEY"), "Meet me at noon.")

    def test_substitution_break_recovers_english(self):
        import random
        import string
        rng = random.Random(12345)
        alphabet = list(string.ascii_uppercase)
        shuffled = alphabet[:]
        rng.shuffle(shuffled)
        enc_map = {alphabet[i]: shuffled[i] for i in range(26)}
        ct = "".join(enc_map.get(ch.upper(), ch) if ch.isalpha() else ch for ch in PLAIN)
        cand = crypto.substitution_break(ct, seed=1)
        # Hill-climbing is heuristic; measure how many letters it actually
        # recovered against the known plaintext.
        pairs = [(a.lower(), b.lower()) for a, b in zip(cand.text, PLAIN) if b.isalpha()]
        accuracy = sum(1 for a, b in pairs if a == b) / len(pairs)
        self.assertGreater(accuracy, 0.9)
        self.assertGreater(crypto.word_hits(cand.text), 0.4)


class TestXor(unittest.TestCase):
    def test_single_byte_xor_break(self):
        pt = b"Attack the server at midnight sharp."
        ct = bytes(b ^ 0x42 for b in pt)
        best = crypto.xor_single_break(ct, top=1)[0]
        self.assertEqual(best.raw, pt)
        self.assertEqual(best.key, "66")

    def test_repeating_key_xor_break(self):
        pt = (b"We hold these truths to be self evident that all people are "
              b"created equal and deserve a fair and honest hearing in every court.")
        ct = crypto.xor_bytes(pt, b"KEY")
        cand = crypto.xor_repeating_break(ct, max_keylen=10)
        self.assertEqual(cand.raw, pt)
        self.assertEqual(cand.extra.get("key_ascii"), "KEY")


class TestHashes(unittest.TestCase):
    def test_identify(self):
        self.assertIn("md5", crypto.identify_hash("5f4dcc3b5aa765d61d8327deb882cf99"))
        self.assertIn("sha1", crypto.identify_hash("a" * 40))
        self.assertIn("sha256", crypto.identify_hash("a" * 64))
        self.assertEqual(crypto.identify_hash("$2a$10$" + "a" * 53), ["bcrypt"])

    def test_dictionary_attack(self):
        target = hashlib.md5(b"password").hexdigest()
        res = crypto.dictionary_attack(target, ["admin", "letmein", "password", "root"])
        self.assertTrue(res["found"])
        self.assertEqual(res["word"], "password")
        self.assertEqual(res["algo"], "md5")

    def test_dictionary_attack_bounded(self):
        res = crypto.dictionary_attack("deadbeef", ["a", "b", "c"], max_words=2)
        self.assertFalse(res["found"])
        self.assertEqual(res["tried"], 2)


class TestScoringAndAnalyze(unittest.TestCase):
    def test_english_scores_above_noise(self):
        self.assertGreater(crypto.english_score(PLAIN),
                           crypto.english_score("xzqjkvbwpf mdlrht gnzxqv"))

    def test_analyze_solves_caesar(self):
        ct = solver.caesar_shift(PLAIN, 11)
        out = crypto.analyze(ct)
        self.assertTrue(out["readable"])
        self.assertEqual(out["best"]["text"], PLAIN)


if __name__ == "__main__":
    unittest.main()
