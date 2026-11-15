"""The training lab: built-in, intentionally-solvable crypto challenges where
the offensive cipher code runs safely on bundled material only — never on a
network target. See challenges.py."""
from .challenges import (
    CHALLENGES,
    grade_attempt,
    list_challenges,
    solve,
    solve_all,
)

__all__ = ["CHALLENGES", "grade_attempt", "list_challenges", "solve", "solve_all"]
