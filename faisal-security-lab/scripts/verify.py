#!/usr/bin/env python3
"""Sync the connector registry against live tool readiness and print the state
of every tool and connector. Use after installing or updating tools.

It prepares the database if there is none yet, but never creates the owner
account: that is left to the first server start, which is where a generated
owner password is shown."""
from __future__ import annotations

import sys
import textwrap
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.bootstrap import init_platform       # noqa: E402
from app.connectors import all_connectors       # noqa: E402
from app import store                            # noqa: E402

WIDTH = 110
DETAIL_AT = 18 + 9 + 12 + 28      # the four columns before the detail


def table_row(name: str, kind: str, state: str, version: str, detail: str) -> str:
    """One row of the table. A detail that does not fit its column goes on
    under the column, broken between words, never inside one."""
    lines = textwrap.wrap(detail, WIDTH - DETAIL_AT, break_long_words=False,
                          break_on_hyphens=False) or [""]
    first = f"{name:<18}{kind:<9}{state:<12}{version[:26]:<28}{lines[0]}"
    return "\n".join([first] + [" " * DETAIL_AT + line for line in lines[1:]])


def main():
    init_platform(create_owner=False)
    print(f"{'connector':<18}{'type':<9}{'state':<12}{'version':<28}detail")
    print("-" * WIDTH)
    for c in sorted(all_connectors(), key=lambda x: x.name):
        r = c.readiness()
        reg = store.get_tool_registry(c.name) or {}
        print(table_row(c.name, c.connector_type, reg.get("state", ""),
                        str(r.get("version") or "-"), str(r.get("detail") or "")))
    verified = [t for t in store.list_tool_registry() if t["state"] == "verified"]
    blocked = [t for t in store.list_tool_registry() if t["state"] == "blocked"]
    print("\nverified:", [t["name"] for t in verified])
    print("blocked :", [(t["name"], t["readiness"].get("detail", "")) for t in blocked])


if __name__ == "__main__":
    main()
