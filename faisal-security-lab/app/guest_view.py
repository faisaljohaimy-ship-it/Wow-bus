"""What the guest of the public read-only view is shown in a response.

Every response served to a guest principal passes through `apply` (a single
call in app/server.py, after the route handler has returned), so a field added
to a guest-readable route later is covered without touching its handler:

  * evidence text, and where it is stored, never leaves the server: the keys
    redacted_summary and storage_ref are dropped wherever they appear;
  * the server's filesystem layout is not shown: local_path and the "path" of
    a readiness object (a tool binary) are dropped, and inside every string
    the application directory is cut off ("<app dir>/samples/x" reads
    "samples/x") and the data directory reads "data". The bundled sample reads
    "samples/vulnerable-app" under any directory, so a database that an
    install at another path filled does not show that path either;
  * what a person typed into an authorization scope stays with the people who
    sign in: owner_contact and proof are dropped;
  * the text of a caught exception is not shown: an error with the code
    worker_error (a job) or internal (a route) keeps its code and gets a fixed
    message.

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
# Where the bundled sample lives below it (app/demo.py: SAMPLE_DIR).
SAMPLE_REL = "samples/vulnerable-app"

DROPPED_KEYS = frozenset({"redacted_summary", "storage_ref", "local_path",
                          "owner_contact", "proof"})
READINESS_DROPPED_KEYS = frozenset({"path"})     # only inside a "readiness" object
DATA_DIR_ALIAS = "data"

# Error codes whose message is str() of whatever exception was caught, cut to
# a fixed length: a job that died in the worker, and a route that failed
# unexpectedly. Such a text can name any file on the server (a tool binary, a
# job's working directory), and the cut can end inside a directory that would
# otherwise be recognized, so a guest is given a fixed sentence in its place.
FREE_TEXT_ERRORS = {
    "worker_error": "unexpected error while running the scan; sign in to read the details",
    "internal": "internal error",
}

# A character that can be part of a file or directory name next to a match.
_NAME = r"[\w.\-]"
# Not the start of a sibling such as "<dir>2", "<dir>-old" or "<dir>.bak". A
# full stop or dash that ends the sentence after the directory is no sibling.
_END = r"(?!\w|[.\-]\w)"

# The sample as an absolute path below some other application directory:
# everything in front of "samples/" goes. A path is taken whole, from a slash
# with no name character or slash in front of it (which leaves a URL ending in
# the same words alone), so a text is read once however many slashes it has.
_ABSOLUTE_PATH = re.compile(r"""(?<![\w.\-/])(?:/[^/\s"'<>]+)+""")
_SAMPLE_IN_PATH = re.compile(rf"/{re.escape(SAMPLE_REL)}{_END}")


def _sample_elsewhere(path: re.Match) -> str:
    found = _SAMPLE_IN_PATH.search(path[0])
    return path[0][found.start() + 1:] if found else path[0]


def _spellings(prefix: str) -> list[str]:
    """How one directory can be written in a response body: as it is (JSON
    values, Markdown), HTML-escaped (the HTML report) and JSON-escaped (a JSON
    text that could not be parsed). Longest first, so an escaped form wins over
    a shorter one that it starts with."""
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
        # Whole path components only, and not the tail of a longer path or URL
        # ("/mnt<dir>", "host.example<dir>").
        start, replacement = rf"(?<!{_NAME})", alias
        if prefix.count("/") > 1:
            # A directory this deep is specific to this server, so it is also
            # cut when it is glued to a word ("-I<dir>/include", "x<dir>"),
            # unless that word follows a slash and so belongs to a longer path.
            # The word is matched and put back. A directory directly below the
            # root ("/app", "/data") gets no such rule: it is the middle of too
            # many unrelated paths ("src/app/main.py").
            start = rf"(?:(?P<glue>(?<![\w.\-/]){_NAME}+)|{start})"
            replacement = rf"\g<glue>{alias}"
        # Nothing takes the application directory's place, so its separator
        # goes too.
        end = _END if alias else rf"(?:/|{_END})"
        rules.append((re.compile(rf"{start}(?:{forms}){end}"), replacement))
    return tuple(rules)


def _strip_dirs(text: str, rules: tuple) -> str:
    for pattern, alias in rules:
        text = pattern.sub(alias, text)
    return _ABSOLUTE_PATH.sub(_sample_elsewhere, text)


def _walk(obj, rules: tuple, in_readiness: bool = False):
    if isinstance(obj, str):
        return _strip_dirs(obj, rules)
    if isinstance(obj, dict):
        out = {key: _walk(value, rules, key == "readiness")
               for key, value in obj.items()
               if key not in DROPPED_KEYS
               and not (in_readiness and key in READINESS_DROPPED_KEYS)}
        code = obj.get("code")
        if isinstance(code, str) and code in FREE_TEXT_ERRORS and "message" in out:
            out["message"] = FREE_TEXT_ERRORS[code]
        return out
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
        if content_type.split(";")[0].strip() == "application/json":
            # JSON that a handler serialized itself (the SARIF report). Its
            # strings are treated decoded, like those of any other JSON body:
            # in the encoded text a path that follows a line break follows the
            # letter of "\n". Written back in the layout app/reports.py uses.
            try:
                return content_type, json.dumps(_walk(json.loads(text), rules),
                                                ensure_ascii=False, indent=2)
            except ValueError:
                pass
        return content_type, _strip_dirs(text, rules)
    return _walk(body, rules)
