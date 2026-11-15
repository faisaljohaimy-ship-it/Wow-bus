"""Where the deploy files, the container entrypoint and the server meet.

Each piece is tested on its own elsewhere. These tests follow one setting from
the place that sets it to the place that acts on it: the entrypoint's report of
a failed privilege drop, the client-address header named in the deploy files,
the setting names the guides tell an operator to use, the owner password and
the published port in the compose file, and what the CI workflow is allowed to
do and when it runs.
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
import textwrap
import tomllib
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
ENTRYPOINT = ROOT / "deploy" / "entrypoint.sh"
COMPOSE_YAML = ROOT / "deploy" / "compose.yaml"
RENDER_YAML = REPO / "render.yaml"
FLY_TOML = ROOT / "fly.toml"
WORKFLOW = REPO / ".github" / "workflows" / "faisal-security-lab-ci.yml"

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
        written = [RENDER_YAML, FLY_TOML, COMPOSE_YAML, ROOT / ".env.example",
                   ROOT / "docs" / "DEPLOY.md", ROOT / "docs" / "OPERATIONS.md"]
        for path in written:
            # A trailing underscore is a family of settings (FSL_OWNER_*).
            for name in sorted(set(re.findall(r"FSL_[A-Z0-9_]+", path.read_text()))):
                with self.subTest(file=path.name, setting=name):
                    self.assertIn(name, code)


# The standard library has no YAML reader. The two files read below keep to a
# plain layout (one key per line, block lists), which these helpers follow.
def yaml_block(text: str, key: str, indent: int) -> list[str]:
    """The lines under `key:` written at the given indentation, up to the next
    line that is not indented deeper. Blank and comment lines are left out.
    An empty list when the key is not there."""
    lines = text.splitlines()
    opening = re.compile(rf" {{{indent}}}{re.escape(key)}:\s*(#.*)?")
    start = next((i for i, line in enumerate(lines) if opening.fullmatch(line)), None)
    block: list[str] = []
    if start is None:
        return block
    for line in lines[start + 1:]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if len(line) - len(line.lstrip()) <= indent:
            break
        block.append(line)
    return block


def workflow_paths(text: str, trigger: str) -> list[str]:
    """The path filter of one trigger under `on:`."""
    under_trigger = "\n".join(yaml_block(text, trigger, 2))
    return [re.sub(r"^\s*-\s*", "", line).strip().strip("\"'")
            for line in yaml_block(under_trigger, "paths", 4)]


def workflow_step_script(text: str, name: str) -> str:
    """The shell script of the named step (the body of its `run: |`)."""
    lines = text.splitlines()
    at = next(i for i, line in enumerate(lines) if line.strip() == f"- name: {name}")
    run = next(i for i in range(at + 1, len(lines)) if lines[i].strip() == "run: |")
    indent = len(lines[run]) - len(lines[run].lstrip())
    body = []
    for line in lines[run + 1:]:
        if line.strip() and len(line) - len(line.lstrip()) <= indent:
            break
        body.append(line)
    return textwrap.dedent("\n".join(body)).strip() + "\n"


class TestWorkflowFile(unittest.TestCase):
    """What the CI job may do, when it runs, and what it uploads."""

    def setUp(self):
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_the_job_token_can_only_read_the_repository(self):
        self.assertEqual([line.strip() for line in yaml_block(self.text, "permissions", 0)],
                         ["contents: read"])
        self.assertEqual(self.text.count("permissions:"), 1)     # no job widens it again
        # A pull request from a fork runs this file with the fork's changes,
        # so it must never be handed a secret or a token that can write.
        self.assertNotIn("pull_request_target", self.text)
        self.assertNotRegex(self.text, r"secrets\.\w")           # no ${{ secrets.NAME }}
        self.assertNotIn("github.token", self.text)

    def test_both_triggers_cover_every_file_the_tests_read(self):
        needed = [f"{ROOT.name}/**", WORKFLOW.relative_to(REPO).as_posix(),
                  RENDER_YAML.relative_to(REPO).as_posix()]
        self.assertEqual(needed, ["faisal-security-lab/**",
                                  ".github/workflows/faisal-security-lab-ci.yml", "render.yaml"])
        for trigger in ("push", "pull_request"):
            with self.subTest(trigger=trigger):
                self.assertEqual(sorted(workflow_paths(self.text, trigger)), sorted(needed))

    @unittest.skipUnless(shutil.which("bash"), "needs bash")
    def test_a_missing_tool_is_announced_without_failing_the_job(self):
        steps = re.findall(r"^\s*- name: (.+)$", self.text, re.M)
        self.assertLess(steps.index("Add tools to PATH"), steps.index("Warn about missing tools"))
        self.assertLess(steps.index("Warn about missing tools"),
                        steps.index("Unit + integration tests"))
        script = workflow_step_script(self.text, "Warn about missing tools")
        tools = ("bandit", "gitleaks", "pip-audit", "semgrep")
        only_path = Path(tempfile.mkdtemp(prefix="fsl-ci-path-"))

        def run_step():
            # A step's script is run by `bash -e`.
            return subprocess.run([shutil.which("bash"), "-e", "-c", script],
                                  env={"PATH": str(only_path)}, capture_output=True, text=True,
                                  timeout=60)

        proc = run_step()                                        # none of the four is there
        self.assertEqual((proc.returncode, proc.stderr), (0, ""))
        warnings = proc.stdout.splitlines()
        self.assertEqual(len(warnings), len(tools))
        for tool, line in zip(tools, warnings):
            with self.subTest(tool=tool):
                self.assertRegex(line, rf"^::warning( [^:]+)?::{re.escape(tool)} is not on PATH")
        for tool in tools:
            (only_path / tool).write_text("#!/bin/sh\n")
            (only_path / tool).chmod(0o755)
        proc = run_step()                                        # all four are there
        self.assertEqual((proc.returncode, proc.stdout, proc.stderr), (0, "", ""))

    def test_the_uploaded_report_is_the_untracked_one(self):
        self.assertIn("path: faisal-security-lab/var/acceptance-report.json", self.text)
        self.assertNotIn("evidence/acceptance-report.json", self.text)
        self.assertNotIn("--evidence", self.text)                # CI never rewrites the tracked copy


class TestComposeFile(unittest.TestCase):
    def setUp(self):
        self.text = COMPOSE_YAML.read_text(encoding="utf-8")

    def service(self, name: str) -> str:
        return "\n".join(yaml_block(self.text, name, 2))

    def test_the_api_port_is_published_on_this_machine_only(self):
        published = re.findall(r"^\s*ports:\s*\[(.*)\]\s*$", self.text, re.M)
        self.assertEqual(published, ['"127.0.0.1:8787:8787"'])
        self.assertIn("ports:", self.service("api"))

    def test_owner_password_goes_to_the_service_that_creates_the_owner_and_no_other(self):
        api, worker = self.service("api"), self.service("worker")
        self.assertIn("FSL_OWNER_PASSWORD: ${FSL_OWNER_PASSWORD:-}", api)
        self.assertNotIn("FSL_OWNER", worker)
        # The API image starts the server, which creates the owner; the worker
        # image starts the worker, which never does.
        self.assertIn("deploy/Dockerfile.api", api)
        self.assertIn('CMD ["python3", "-m", "app.server"]',
                      (ROOT / "deploy" / "Dockerfile.api").read_text(encoding="utf-8"))
        self.assertIn("deploy/Dockerfile.worker", worker)
        self.assertNotIn("bootstrap", (ROOT / "app" / "worker.py").read_text(encoding="utf-8"))

    def test_a_password_left_unset_arrives_empty_and_one_is_generated(self):
        # `${FSL_OWNER_PASSWORD:-}` gives the container an empty value when the
        # variable is not set where `docker compose` runs.
        from app import bootstrap, config, db
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        self.addCleanup(config.reset_config_for_tests, config._CONFIG)
        self.addCleanup(db.reset_db_for_tests, db._DB)
        for key in ("FSL_DB_PATH", "FSL_EVIDENCE_DIR", "FSL_OWNER_EMAIL"):
            os.environ.pop(key, None)
        os.environ["FSL_DATA_DIR"] = tempfile.mkdtemp(prefix="fsl-seam-")
        os.environ["FSL_OWNER_PASSWORD"] = ""
        cfg = config.Config.from_env()
        config.reset_config_for_tests(cfg)
        db.reset_db_for_tests(db.Database(cfg.db_path))
        created = bootstrap.init_platform(sync_tools=False)["owner_bootstrap"]
        self.assertTrue(created["created"] and created["generated"])
        self.assertTrue(created["password"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
