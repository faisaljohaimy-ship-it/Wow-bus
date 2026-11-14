"""Where the deploy files, the container entrypoint and the server meet.

Each piece is tested on its own elsewhere. These tests follow one setting from
the place that sets it to the place that acts on it: the entrypoint's report of
a failed privilege drop, the client-address header named in the deploy files,
and the setting names the guides tell an operator to use.
"""
from __future__ import annotations

import http.client
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
ENTRYPOINT = ROOT / "deploy" / "entrypoint.sh"
RENDER_YAML = ROOT.parent / "render.yaml"
FLY_TOML = ROOT / "fly.toml"

# Stand-ins for the commands the entrypoint uses to find out who it is and to
# change that, so its root path runs the same way whoever runs the tests and
# nothing on this machine is re-owned.
FAKE_ID = "#!/bin/sh\necho 0\n"
FAKE_CHOWN = "#!/bin/sh\nexit 0\n"
SETPRIV_REFUSED = "#!/bin/sh\nexit 1\n"
SETPRIV_ALLOWED = ("#!/bin/sh\n"
                   "while [ $# -gt 0 ]; do case \"$1\" in --*) shift ;; *) break ;; esac; done\n"
                   "exec \"$@\"\n")

# Run by the entrypoint in place of the server: starts the platform the way the
# server does and prints the notices it ends up with.
STARTUP_PROBE = """
import json, os
from unittest import mock
from app import bootstrap
with mock.patch("os.geteuid", return_value=0):
    info = bootstrap.init_platform(sync_tools=False)
print(json.dumps({"flag": os.environ.get("FSL_PRIVDROP_FAILED"),
                  "all": info["setup_notices"],
                  "admin": list(bootstrap.ADMIN_NOTICES),
                  "public": list(bootstrap.SETUP_NOTICES)}))
"""


@unittest.skipUnless(shutil.which("sh"), "needs sh")
class TestFailedPrivilegeDropNotice(unittest.TestCase):
    def start_through_entrypoint(self, setpriv: str, extra_env: dict | None = None):
        tmp = Path(tempfile.mkdtemp(prefix="fsl-seam-")).resolve()
        fake_bin = tmp / "bin"
        fake_bin.mkdir()
        for name, body in (("id", FAKE_ID), ("chown", FAKE_CHOWN), ("setpriv", setpriv)):
            (fake_bin / name).write_text(body)
            (fake_bin / name).chmod(0o755)
        data = tmp / "data"
        data.mkdir()
        env = {"PATH": f"{fake_bin}{os.pathsep}{os.environ.get('PATH', '/usr/bin:/bin')}",
               "FSL_DATA_DIR": str(data), "TMPDIR": str(tmp),
               "FSL_OWNER_EMAIL": "owner@test.local",
               "FSL_OWNER_PASSWORD": "owner-password-123"}
        env.update(extra_env or {})
        proc = subprocess.run(["sh", str(ENTRYPOINT), sys.executable, "-c", STARTUP_PROBE],
                              cwd=str(ROOT), env=env, capture_output=True, text=True, timeout=120)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout.splitlines()[-1]), proc.stderr

    def test_failed_drop_becomes_a_notice_for_owners_only(self):
        seen, stderr = self.start_through_entrypoint(SETPRIV_REFUSED)
        self.assertIn("could not drop privileges", stderr)
        self.assertEqual(seen["flag"], "1")
        self.assertIn("running_as_root", seen["all"])
        self.assertIn("running_as_root", seen["admin"])
        self.assertNotIn("running_as_root", seen["public"])

    def test_successful_drop_reports_nothing_even_if_the_flag_was_inherited(self):
        seen, stderr = self.start_through_entrypoint(SETPRIV_ALLOWED,
                                                     {"FSL_PRIVDROP_FAILED": "1"})
        self.assertNotIn("could not drop privileges", stderr)
        self.assertIsNone(seen["flag"])
        self.assertNotIn("running_as_root", seen["all"])


def render_env() -> dict:
    """key -> value for the envVars entries of render.yaml that carry a value."""
    out, key = {}, None
    for line in RENDER_YAML.read_text().splitlines():
        entry = re.match(r"\s*-\s*key:\s*(\S+)", line)
        if entry:
            key = entry.group(1)
            continue
        value = re.match(r"\s*value:\s*(.*?)\s*(?:#.*)?$", line)
        if value and key:
            out[key] = value.group(1).strip("\"'")
            key = None
    return out


class TestClientAddressHeaderFromDeployFiles(unittest.TestCase):
    def setUp(self):
        from app import config
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        self.addCleanup(config.reset_config_for_tests, config._CONFIG)
        for key in ("FSL_DB_PATH", "FSL_EVIDENCE_DIR", "FSL_TRUSTED_PROXY_HOPS"):
            os.environ.pop(key, None)
        os.environ["FSL_DATA_DIR"] = tempfile.mkdtemp(prefix="fsl-seam-")

    def test_the_header_each_platform_file_names_is_accepted_and_used(self):
        from app import server
        from app.config import Config, reset_config_for_tests
        named = {"render.yaml": render_env().get("FSL_CLIENT_IP_HEADER"),
                 "fly.toml": tomllib.loads(FLY_TOML.read_text()).get("env", {})
                                    .get("FSL_CLIENT_IP_HEADER")}
        for source, header in named.items():
            with self.subTest(source=source):
                self.assertTrue(header, f"{source} does not set FSL_CLIENT_IP_HEADER")
                os.environ["FSL_CLIENT_IP_HEADER"] = header
                cfg = Config.from_env()
                reset_config_for_tests(cfg)
                self.assertEqual(cfg.client_ip_header, header)
                # A header the server also knows as a proxy header, so a deploy
                # that loses the setting shows up as proxy_headers_ignored.
                self.assertIn(header, server._PROXY_HEADERS)
                request = http.client.HTTPMessage()
                request.add_header(header, "203.0.113.7")
                request.add_header("X-Forwarded-For", "198.51.100.9")
                self.assertEqual(server.resolve_client(request, "10.0.0.1"),
                                 ("203.0.113.7", "header"))


class TestDocumentedSettingNames(unittest.TestCase):
    def test_every_setting_in_the_deploy_files_and_guides_is_read_by_the_code(self):
        readers = [*sorted((ROOT / "app").rglob("*.py")), ENTRYPOINT]
        code = "\n".join(p.read_text() for p in readers)
        written = [RENDER_YAML, FLY_TOML, ROOT / ".env.example",
                   ROOT / "docs" / "DEPLOY.md", ROOT / "docs" / "OPERATIONS.md"]
        for path in written:
            # A trailing underscore is a family of settings (FSL_OWNER_*).
            for name in sorted(set(re.findall(r"FSL_[A-Z0-9_]+", path.read_text()))):
                with self.subTest(file=path.name, setting=name):
                    self.assertIn(name, code)


if __name__ == "__main__":
    unittest.main(verbosity=2)
