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
# nothing on this machine is created or re-owned. chown and mkdir write down
# what they were asked to do instead of doing it.
FAKE_ID = "#!/bin/sh\necho {uid}\n"
RECORDING = '#!/bin/sh\nprintf \'%s\\n\' "{name} $*" >> "$SEAM_CALLS_FILE"\nexit 0\n'
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


class EntrypointRun:
    """Runs the real entrypoint with stand-in commands, by default as if
    started by root."""

    def __init__(self, setpriv: str, uid: int = 0):
        self.tmp = Path(tempfile.mkdtemp(prefix="fsl-seam-")).resolve()
        fake_bin = self.tmp / "bin"
        fake_bin.mkdir()
        for name, body in (("id", FAKE_ID.format(uid=uid)),
                           ("chown", RECORDING.format(name="chown")),
                           ("mkdir", RECORDING.format(name="mkdir")), ("setpriv", setpriv)):
            (fake_bin / name).write_text(body)
            (fake_bin / name).chmod(0o755)
        self.calls_file = self.tmp / "calls"
        self.data = self.tmp / "data"
        self.data.mkdir()
        self.env = {"PATH": f"{fake_bin}{os.pathsep}{os.environ.get('PATH', '/usr/bin:/bin')}",
                    "FSL_DATA_DIR": str(self.data), "TMPDIR": str(self.tmp),
                    "SEAM_CALLS_FILE": str(self.calls_file)}

    def run(self, command: list, extra_env: dict | None = None, cwd: Path | None = None):
        proc = subprocess.run(["sh", str(ENTRYPOINT), *command], cwd=str(cwd or ROOT),
                              env={**self.env, **(extra_env or {})},
                              capture_output=True, text=True, timeout=120)
        calls = self.calls_file.read_text().splitlines() if self.calls_file.exists() else []
        return proc, calls


@unittest.skipUnless(shutil.which("sh"), "needs sh")
class TestFailedPrivilegeDropNotice(unittest.TestCase):
    def start_through_entrypoint(self, setpriv: str, extra_env: dict | None = None):
        env = {"FSL_OWNER_EMAIL": "owner@test.local", "FSL_OWNER_PASSWORD": "owner-password-123"}
        env.update(extra_env or {})
        proc, _ = EntrypointRun(setpriv).run([sys.executable, "-c", STARTUP_PROBE], env)
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


def _canonicalises_missing_paths() -> bool:
    try:
        return subprocess.run(["realpath", "-m", "--", "/nonexistent/a/../b"],
                              capture_output=True, text=True,
                              timeout=30).stdout.strip() == "/nonexistent/b"
    except (OSError, subprocess.SubprocessError):
        return False


# Run by the entrypoint in place of the server: shows that the command ran,
# and which data directory it was handed.
ECHO = ["sh", "-c", 'printf "ran data=%s\\n" "$FSL_DATA_DIR"']


@unittest.skipUnless(shutil.which("sh") and _canonicalises_missing_paths(),
                     "needs sh and a realpath that supports -m (GNU coreutils)")
class TestEntrypointRealRun(unittest.TestCase):
    """What the entrypoint does, not only what its dry run says it would do."""

    def test_required_non_root_stops_before_the_command(self):
        entry = EntrypointRun(SETPRIV_REFUSED)
        proc, _ = entry.run(ECHO, {"FSL_REQUIRE_NONROOT": "1"})
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stdout, "")
        self.assertIn("FSL_REQUIRE_NONROOT=1", proc.stderr)
        # Without the setting the same start carries on as the current user.
        proc, _ = entry.run(ECHO)
        self.assertEqual((proc.returncode, proc.stdout), (0, f"ran data={entry.data}\n"))
        self.assertIn("could not drop privileges", proc.stderr)

    def test_accepted_directory_is_created_and_re_owned_by_its_canonical_path(self):
        entry = EntrypointRun(SETPRIV_ALLOWED)
        if os.stat(entry.data).st_uid == 10001:
            self.skipTest("the tests run as the service user; nothing would be re-owned")
        (entry.tmp / "other").mkdir()
        roundabout = f"{entry.tmp}/other/../data"
        dry, _ = entry.run(ECHO, {"FSL_DATA_DIR": roundabout, "FSL_ENTRYPOINT_DRY_RUN": "1"})
        if not dry.stdout.startswith(f"data-dir: accept {entry.data}\n"):
            self.skipTest("the temporary directory is inside a system tree")
        proc, calls = entry.run(ECHO, {"FSL_DATA_DIR": roundabout})
        self.assertEqual((proc.returncode, proc.stdout), (0, f"ran data={roundabout}\n"))
        # -R -h: the whole tree, and a symlink itself rather than its target.
        self.assertEqual(calls, [f"mkdir -p -- {entry.data}",
                                 f"chown -R -h 10001:10001 -- {entry.data}"])

    def test_refused_directory_is_neither_created_nor_re_owned(self):
        entry = EntrypointRun(SETPRIV_ALLOWED)
        # A relative value is refused wherever the tests run. It is resolved
        # against an empty directory, so even a faulty entrypoint could only
        # reach into that.
        cwd = entry.tmp / "cwd"
        cwd.mkdir()
        proc, calls = entry.run(ECHO, {"FSL_DATA_DIR": "state"}, cwd=cwd)
        self.assertEqual((proc.returncode, proc.stdout), (0, "ran data=state\n"))
        self.assertIn("'state' is not a dedicated data directory", proc.stderr)
        self.assertEqual(calls, [])
        self.assertEqual(list(cwd.iterdir()), [])

    def test_empty_setting_hands_the_default_directory_to_the_server(self):
        # The entrypoint takes an empty or missing FSL_DATA_DIR to mean /data,
        # while the server would read it as its own default; the value passed
        # on keeps both on the same directory. Started as an ordinary user the
        # entrypoint prepares nothing, so /data itself is never touched here.
        entry = EntrypointRun(SETPRIV_REFUSED, uid=1000)
        for given in ("", None):
            with self.subTest(given=given):
                if given is None:
                    del entry.env["FSL_DATA_DIR"]
                else:
                    entry.env["FSL_DATA_DIR"] = given
                proc, calls = entry.run(ECHO)
                self.assertEqual((proc.returncode, proc.stdout, proc.stderr),
                                 (0, "ran data=/data\n", ""))
                self.assertEqual(calls, [])
                dry, _ = entry.run(ECHO, {"FSL_ENTRYPOINT_DRY_RUN": "1"})
                self.assertEqual(dry.stdout.splitlines()[0],
                                 "data-dir: accept " + os.path.realpath("/data"))


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
