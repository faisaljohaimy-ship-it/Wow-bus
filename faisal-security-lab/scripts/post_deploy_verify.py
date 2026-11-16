#!/usr/bin/env python3
"""Post-deploy verification (spec §29/§30): confirm a deployed release actually
runs, using LOW-IMPACT checks only.

    python3 scripts/post_deploy_verify.py https://your-app.example.com

Exit code 0 means every mandatory check passed. The heavier, authenticated
checks (create a lab job, cancel it) run only when FSL_VERIFY_TOKEN is set to an
owner/analyst session token and FSL_VERIFY_PROJECT/ASSET/SCOPE name an authorized
LAB target; otherwise they are reported as skipped — never faked.

Deploying a platform is not the same as a successful release: the build passing
or the deploy job starting proves nothing. This script checks the running app.
It is deliberately read-only against production (an optional lab scan is the only
write, and only when you opt in with a lab target).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

TIMEOUT = 20


def _get(base: str, path: str, token: str = "") -> tuple[int, object]:
    req = urllib.request.Request(base.rstrip("/") + path)
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:  # noqa: S310 (fixed base URL)
            body = r.read().decode("utf-8", "replace")
            try:
                return r.status, json.loads(body)
            except ValueError:
                return r.status, body
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace"))
        except (ValueError, OSError):
            return e.code, None
    except (urllib.error.URLError, OSError, ValueError) as e:
        return 0, str(e)


class Checks:
    def __init__(self, base: str):
        self.base = base
        self.results: list[dict] = []

    def record(self, name: str, ok: bool, detail: str, *, mandatory: bool = True):
        self.results.append({"check": name, "ok": ok, "mandatory": mandatory, "detail": detail})

    def skip(self, name: str, detail: str):
        self.results.append({"check": name, "ok": None, "mandatory": False, "detail": detail})

    # 1. the domain opens and serves the app ---------------------------------
    def health(self):
        st, body = _get(self.base, "/api/health")
        self.record("domain serves /api/health", st == 200 and isinstance(body, dict) and body.get("ok"),
                    f"status={st}")

    # version of the running build (ties the release to a known version) ------
    def version(self):
        st, body = _get(self.base, "/api/config")
        ver = body.get("version") if isinstance(body, dict) else None
        self.record("running build reports a version", st == 200 and bool(ver),
                    f"status={st} version={ver}")

    # 3. API + tool readiness ------------------------------------------------
    def connectors_ready(self):
        st, body = _get(self.base, "/api/connectors")
        conns = body.get("connectors", []) if isinstance(body, dict) else []
        ready = [c for c in conns if (c.get("readiness") or {}).get("available")]
        self.record("core tools report readiness", st == 200 and len(ready) >= 1,
                    f"status={st} ready={len(ready)}/{len(conns)}")

    # public read-only view (if enabled) loads -------------------------------
    def public_view(self):
        st, body = _get(self.base, "/api/projects")
        self.record("project listing responds", st in (200, 401),
                    f"status={st}", mandatory=False)

    # 5/6. optional authenticated lab scan + cancel (opt-in) -----------------
    def lab_scan(self):
        token = os.environ.get("FSL_VERIFY_TOKEN", "")
        pid = os.environ.get("FSL_VERIFY_PROJECT", "")
        aid = os.environ.get("FSL_VERIFY_ASSET", "")
        sid = os.environ.get("FSL_VERIFY_SCOPE", "")
        conn = os.environ.get("FSL_VERIFY_CONNECTOR", "semgrep")
        if not (token and pid and aid and sid):
            self.skip("lab scan + cancel (authenticated)",
                      "set FSL_VERIFY_TOKEN/PROJECT/ASSET/SCOPE (authorized lab target) to run")
            return
        payload = json.dumps({"asset_id": aid, "scope_id": sid, "connector": conn,
                              "params": {}}).encode()
        req = urllib.request.Request(self.base.rstrip("/") + f"/api/projects/{pid}/scans",
                                     data=payload, method="POST")
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:  # noqa: S310
                job = json.loads(r.read().decode("utf-8", "replace")).get("job", {})
        except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError) as e:
            self.record("lab scan enqueues via the agent gateway", False, f"enqueue failed: {e}")
            return
        jid = job.get("id")
        self.record("lab scan enqueues via the agent gateway", bool(jid), f"job={jid}")
        if jid:
            _get(self.base, f"/api/jobs/{jid}")  # status reachable
            # cancel it (controlled)
            try:
                creq = urllib.request.Request(self.base.rstrip("/") + f"/api/jobs/{jid}/stop",
                                              data=b"{}", method="POST")
                creq.add_header("Authorization", f"Bearer {token}")
                creq.add_header("Content-Type", "application/json")
                urllib.request.urlopen(creq, timeout=TIMEOUT).read()  # noqa: S310
                self.record("lab scan can be cancelled", True, f"job={jid} cancelled")
            except (urllib.error.HTTPError, urllib.error.URLError, OSError) as e:
                self.record("lab scan can be cancelled", False, str(e))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: post_deploy_verify.py <base_url>", file=sys.stderr)
        return 2
    base = argv[1]
    c = Checks(base)
    for step in (c.health, c.version, c.connectors_ready, c.public_view, c.lab_scan):
        try:
            step()
        except Exception as e:  # a check must never crash the verifier
            c.record(step.__name__, False, f"check raised: {e}")
        time.sleep(0.2)

    failed = [r for r in c.results if r["mandatory"] and r["ok"] is False]
    print(f"\nPost-deploy verification of {base}\n" + "=" * 60)
    for r in c.results:
        mark = {True: "PASS", False: "FAIL", None: "SKIP"}[r["ok"]]
        print(f"  [{mark}] {r['check']} — {r['detail']}")
    print("=" * 60)
    if failed:
        print(f"RESULT: FAILED ({len(failed)} mandatory check(s) failed). Do NOT promote; "
              "roll back per docs/ROLLBACK.md if the previous version was replaced.")
        return 1
    print("RESULT: OK (mandatory checks passed). Record the commit, deploy id and time.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
