#!/usr/bin/env python3
"""Sync the connector registry against live tool readiness and print the honest
state of every tool + connector. Use after installing/updating tools."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.bootstrap import init_platform       # noqa: E402
from app.connectors import all_connectors       # noqa: E402
from app import store                            # noqa: E402


def main():
    init_platform()
    print(f"{'connector':<18}{'type':<9}{'state':<12}{'version':<28}detail")
    print("-" * 100)
    for c in sorted(all_connectors(), key=lambda x: x.name):
        r = c.readiness()
        reg = store.get_tool_registry(c.name) or {}
        print(f"{c.name:<18}{c.connector_type:<9}{reg.get('state',''):<12}"
              f"{str(r.get('version') or '-')[:26]:<28}{r.get('detail','')[:48]}")
    verified = [t for t in store.list_tool_registry() if t["state"] == "verified"]
    blocked = [t for t in store.list_tool_registry() if t["state"] == "blocked"]
    print("\nverified:", [t["name"] for t in verified])
    print("blocked :", [(t["name"], t["readiness"].get("detail", "")[:40]) for t in blocked])


if __name__ == "__main__":
    main()
