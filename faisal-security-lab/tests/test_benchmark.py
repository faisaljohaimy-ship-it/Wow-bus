"""Reference evaluation lab (v4 §15): the scoring is honest — it measures on the
held-out set only, reports sample sizes, and writes 'not_computable' rather than
inventing a rate when a set is thin."""
from __future__ import annotations

import unittest

from app import benchmark as B


def _cases():
    cases = []
    # 6 eval positives (defects that SHOULD be found), signatures p0..p5
    for i in range(6):
        cases.append({"id": f"pos{i}", "kind": "positive", "set": "eval", "signature": f"p{i}"})
    # 6 eval benigns (clean), signatures b0..b5
    for i in range(6):
        cases.append({"id": f"ben{i}", "kind": "benign", "set": "eval", "signature": f"b{i}"})
    # dev cases must be ignored by the eval metrics
    cases.append({"id": "devpos", "kind": "positive", "set": "dev", "signature": "p0"})
    return cases


class TestBenchmark(unittest.TestCase):
    def test_scores_only_the_held_out_eval_set(self):
        cases = _cases()
        # Detect 5 of 6 positives (miss p5); trip 1 benign false alarm (b0).
        hits = {"p0", "p1", "p2", "p3", "p4", "b0"}
        r = B.evaluate(cases, hits, split="eval")
        self.assertEqual(r["samples"], {"positive": 6, "benign": 6})
        self.assertEqual(r["detected"], 5)
        self.assertEqual(r["missed"], 1)
        self.assertEqual(r["false_alarms"], 1)
        self.assertEqual(r["known_defect_coverage"], round(5 / 6, 4))
        self.assertEqual(r["false_alarm_rate"], round(1 / 6, 4))
        self.assertEqual(r["precision"], round(5 / 6, 4))

    def test_thin_set_is_not_computable_not_invented(self):
        cases = [{"id": f"p{i}", "kind": "positive", "set": "eval", "signature": f"p{i}"}
                 for i in range(3)]        # below MIN_SAMPLE
        r = B.evaluate(cases, {"p0"}, split="eval")
        self.assertEqual(r["known_defect_coverage"], "not_computable")
        self.assertEqual(r["false_alarm_rate"], "not_computable")

    def test_compare_reports_deltas_and_propagates_not_computable(self):
        cases = _cases()
        base = B.evaluate(cases, {"p0", "p1", "p2", "p3"}, split="eval")       # 4/6
        cur = B.evaluate(cases, {"p0", "p1", "p2", "p3", "p4", "p5"}, split="eval")  # 6/6
        cmp = B.compare(cur, base)
        self.assertGreater(cmp["delta"]["known_defect_coverage"], 0)           # improved
        thin = B.evaluate([{"id": "x", "kind": "positive", "set": "eval", "signature": "p0"}],
                          {"p0"})
        self.assertEqual(B.compare(cur, thin)["delta"]["known_defect_coverage"], "not_computable")

    def test_validate_rejects_bad_cases(self):
        with self.assertRaises(ValueError):
            B.validate_cases([{"id": "a", "kind": "wrong", "signature": "s"}])
        with self.assertRaises(ValueError):
            B.validate_cases([{"id": "a", "kind": "positive", "signature": "s"},
                              {"id": "a", "kind": "benign", "signature": "t"}])
        with self.assertRaises(ValueError):
            B.validate_cases([{"id": "", "kind": "positive", "signature": "s"}])


if __name__ == "__main__":
    unittest.main()
