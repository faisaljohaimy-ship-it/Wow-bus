"""What the guest of the public read-only view is shown in a response.

Every response served to a guest principal passes through `apply` (a single
call in app/server.py, after the route handler has returned), so a field added
to a guest-readable route later is covered without touching its handler:

  * evidence text, and where it is stored, never leaves the server: the keys
    redacted_summary and storage_ref are dropped wherever they appear;
  * the server's filesystem layout is not shown: local_path and the "path" of
    a readiness object (a tool binary) are dropped, and inside every string
    the application directory is cut off ("<app dir>/samples/x" reads
    "samples/x") and the data directory reads "data".

Signed-in principals never go through this module.
"""
from __future__ import annotations

import functools
import html
import json
import re
from pathlib import Path

from .config import get_config

# The directory that holds app/, samples/ and web/.
APP_DIR = Path(__file__).resolve().parent.parent

DROPPED_KEYS = frozenset({"redacted_summary", "storage_ref", "local_path"})
READINESS_DROPPED_KEYS = frozenset({"path"})     # only inside a "readiness" object
DATA_DIR_ALIAS = "data"


def _spellings(prefix: str) -> list[str]:
    """How one directory can be written in a response body: as it is (JSON
    values, Markdown), JSON-escaped (SARIF is served as text) and HTML-escaped
    (the HTML report). Longest first, so an escaped form wins over a shorter
    one that it starts with."""
    forms = {prefix, json.dumps(prefix, ensure_ascii=False)[1:-1], html.escape(prefix)}
    return sorted(forms, key=len, reverse=True)


@functools.lru_cache(maxsize=8)
def _rules(app_dir: str, data_dir: str) -> tuple:
    """(pattern, replacement) pairs. The longer directory goes first, so a data
    directory inside the application directory still reads "data"."""
    rules = []
    for prefix, alias in sorted(((data_dir, DATA_DIR_ALIAS), (app_dir, "")),
                                key=lambda pair: len(pair[0]), reverse=True):
        prefix = prefix.rstrip("/")
        if not prefix:          # "/" reveals nothing and would match every path
            continue
        forms = "|".join(re.escape(form) for form in _spellings(prefix))
        # Whole path components only: not the tail of a longer name (a URL
        # ending in the same words), and not the start of a sibling such as
        # "<dir>2", "<dir>-old" or "<dir>.bak". A full stop or dash that ends
        # the sentence after the directory does not make it a sibling.
        start, end = r"(?<![\w.\-])", r"(?!\w|[.\-]\w)"
        if alias:
            pattern = rf"{start}(?:{forms}){end}"
        else:
            # Nothing takes the directory's place, so its separator goes too.
            pattern = rf"{start}(?:{forms})(?:/|{end})"
        rules.append((re.compile(pattern), alias))
    return tuple(rules)


def _strip_dirs(text: str, rules: tuple) -> str:
    for pattern, alias in rules:
        text = pattern.sub(alias, text)
    return text


def _walk(obj, rules: tuple, in_readiness: bool = False):
    if isinstance(obj, str):
        return _strip_dirs(obj, rules)
    if isinstance(obj, dict):
        return {key: _walk(value, rules, key == "readiness")
                for key, value in obj.items()
                if key not in DROPPED_KEYS
                and not (in_readiness and key in READINESS_DROPPED_KEYS)}
    if isinstance(obj, (list, tuple)):
        return [_walk(item, rules) for item in obj]
    return obj


def apply(body):
    """The guest's view of a handler result.

    `body` is what a route handler returns next to the status: a JSON-ready
    object, or a (content_type, text) pair for the report formats that are
    served as text (HTML, Markdown, SARIF). The input is not modified."""
    rules = _rules(str(APP_DIR), str(get_config().data_dir))
    if isinstance(body, tuple):
        content_type, text = body
        return content_type, _strip_dirs(text, rules)
    return _walk(body, rules)
