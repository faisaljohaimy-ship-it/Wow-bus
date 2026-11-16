"""Reference evaluation lab (v4 §15).

Measures detection quality on cases whose answer is KNOWN, so a claim of
improvement is backed by numbers rather than wording. Two kinds of case:

  * positive — a planted defect that SHOULD be detected; missing it is a miss.
  * benign   — a known-clean case; a detection here is a FALSE ALARM.

Two sets, kept apart so a good score cannot come from tuning rules on the very
examples used to measure them:

  * dev  — the rule-development set; excluded from the reported metrics.
  * eval — the held-out evaluation set; the metrics are computed on this only.

Metrics are computed only on cases that actually have enough samples. When a set
is smaller than MIN_SAMPLE the metric is reported as "not_computable" rather than
an invented rate. Comparing two runs yields deltas, or "not_computable" when
either side is thin. A passing benchmark does not prove every real vulnerability
is found — only how the system did on these known cases.
"""
from __future__ import annotations

MIN_SAMPLE = 5
_KINDS = ("positive", "benign")
_SETS = ("dev", "eval")


def validate_cases(cases: list[dict]) -> None:
    seen = set()
    for c in cases:
        if c.get("kind") not in _KINDS:
            raise ValueError(f"case {c.get('id')!r}: kind must be one of {_KINDS}")
        if c.get("set", "eval") not in _SETS:
            raise ValueError(f"case {c.get('id')!r}: set must be one of {_SETS}")
        sig = c.get("signature")
        if not c.get("id") or not sig:
            raise ValueError("each case needs a non-empty id and signature")
        if c["id"] in seen:
            raise ValueError(f"duplicate case id {c['id']!r}")
        seen.add(c["id"])


def _rate(num: int, den: int):
    return round(num / den, 4) if den >= MIN_SAMPLE else "not_computable"


def evaluate(cases: list[dict], detected_signatures, *, split: str = "eval") -> dict:
    """Score `detected_signatures` (the signatures the tools reported) against the
    cases of the given set. Returns per-metric values and the sample sizes they
    rest on. `detected_signatures` is any container of signature strings."""
    validate_cases(cases)
    hits = set(detected_signatures or [])
    sub = [c for c in cases if c.get("set", "eval") == split]
    positives = [c for c in sub if c["kind"] == "positive"]
    benigns = [c for c in sub if c["kind"] == "benign"]
    detected = [c for c in positives if c["signature"] in hits]
    false_alarms = [c for c in benigns if c["signature"] in hits]
    tp, fa = len(detected), len(false_alarms)
    precision_den = tp + fa
    return {
        "split": split,
        "samples": {"positive": len(positives), "benign": len(benigns)},
        "known_defect_coverage": _rate(tp, len(positives)),       # recall on known positives
        "false_alarm_rate": _rate(fa, len(benigns)),
        "precision": round(tp / precision_den, 4) if precision_den >= MIN_SAMPLE else "not_computable",
        "detected": tp, "missed": len(positives) - tp, "false_alarms": fa,
        "note": "Metrics are on KNOWN cases only; a pass does not prove the absence of other defects.",
    }


def compare(current: dict, baseline: dict) -> dict:
    """Version-over-version change for each numeric metric, or 'not_computable'
    when either run could not compute it."""
    out = {}
    for key in ("known_defect_coverage", "false_alarm_rate", "precision"):
        a, b = current.get(key), baseline.get(key)
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            out[key] = round(a - b, 4)
        else:
            out[key] = "not_computable"
    return {"delta": out, "current": current.get("split"), "note":
            "A positive delta on coverage/precision or a negative delta on "
            "false_alarm_rate is an improvement, on these known cases only."}
