"""The tooling around the platform: the install and acceptance scripts, the
trust store used for AI-provider calls, the licence labels in the tool
registry, the console texts, and the repository's ignore files.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
INSTALL = ROOT / "scripts" / "install-tools.sh"
TWO_ARG_FORM = "bash scripts/install-tools.sh ~/.local/bin ~/sectools-venv"


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True,
                          timeout=60)


def in_a_git_checkout() -> bool:
    """True when git is available and REPO is the top of a working tree (not a
    copy of the files, and not a directory inside some other repository)."""
    if not shutil.which("git"):
        return False
    try:
        top = git("rev-parse", "--show-toplevel")
    except (OSError, subprocess.SubprocessError):
        return False
    return top.returncode == 0 and Path(top.stdout.strip()).resolve() == REPO.resolve()


class TestProviderTrustStore(unittest.TestCase):
    """AI-provider calls verify certificates against the file SSL_CERT_FILE
    names when it is set, and against the default trust store otherwise."""

    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("SSL_CERT_FILE", None)
        self.tmp = Path(tempfile.mkdtemp(prefix="fsl-ca-"))

    def requested_context(self):
        from app.ai import provider
        with mock.patch.object(ssl, "create_default_context", return_value="context") as made:
            self.assertEqual(provider._ssl_ctx(), "context")
        return made

    def test_unset_means_the_default_trust_store(self):
        self.requested_context().assert_called_once_with()

    def test_empty_means_the_default_trust_store(self):
        os.environ["SSL_CERT_FILE"] = "  "
        self.requested_context().assert_called_once_with()

    def test_a_file_named_by_the_setting_is_the_trust_store(self):
        bundle = self.tmp / "bundle.pem"
        bundle.write_text("placeholder")
        os.environ["SSL_CERT_FILE"] = str(bundle)
        self.requested_context().assert_called_once_with(cafile=str(bundle))

    def test_a_missing_file_means_the_default_trust_store(self):
        os.environ["SSL_CERT_FILE"] = str(self.tmp / "absent.pem")
        self.requested_context().assert_called_once_with()

    def test_certificates_are_verified_whatever_the_setting_holds(self):
        from app.ai import provider
        not_a_bundle = self.tmp / "notes.txt"
        not_a_bundle.write_text("not a certificate")
        for value in (None, str(not_a_bundle), str(self.tmp / "absent.pem")):
            with self.subTest(value=value):
                if value is None:
                    os.environ.pop("SSL_CERT_FILE", None)
                else:
                    os.environ["SSL_CERT_FILE"] = value
                context = provider._ssl_ctx()
                self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
                self.assertTrue(context.check_hostname)

    def test_no_path_of_one_particular_machine_is_built_in(self):
        for path in (ROOT / "app" / "ai" / "provider.py", INSTALL):
            with self.subTest(file=path.name):
                self.assertNotIn("/root/", path.read_text(encoding="utf-8"))


# Stand-ins for the commands install-tools.sh uses to fetch and unpack, so the
# whole script can run without a network. Each writes down how it was called.
# "curl" and "tar" leave a small program where the real ones would leave the
# tool; "python3" refuses to make a virtual environment; "rm" removes nothing.
STAND_IN_TOOL = '#!/bin/sh\\necho "stand-in 0.0"\\n'
FAKE_CURL = f"""#!/bin/sh
printf 'curl %s\\n' "$*" >> "$CALLS"
[ -n "$FAKE_CURL_FAILS" ] && exit 22
out=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift ;; esac; shift; done
printf '{STAND_IN_TOOL}' > "$out"
"""
FAKE_TAR = f"""#!/bin/sh
printf 'tar %s\\n' "$*" >> "$CALLS"
printf '{STAND_IN_TOOL}' > "$4/$5"
"""
FAKE_PYTHON = "#!/bin/sh\nprintf 'python3 %s\\n' \"$*\" >> \"$CALLS\"\nexit 1\n"
FAKE_RM = "#!/bin/sh\nprintf 'rm %s\\n' \"$*\" >> \"$CALLS\"\nexit 0\n"


@unittest.skipUnless(shutil.which("bash"), "needs bash")
class TestInstallToolsScript(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="fsl-install-")).resolve()
        self.bin, self.venv = self.tmp / "bin", self.tmp / "venv"
        # A path under a regular file can never be created, whoever runs the tests.
        (self.tmp / "file").write_text("x")
        self.blocked = self.tmp / "file" / "dir"

    def run_script(self, *args, env: dict | None = None):
        return subprocess.run(["bash", str(INSTALL), *map(str, args)], cwd=str(ROOT),
                              env=env, capture_output=True, text=True, timeout=120)

    def test_check_names_both_directories_and_creates_nothing(self):
        proc = self.run_script("--check", self.bin, self.venv)
        self.assertEqual((proc.returncode, proc.stderr), (0, ""))
        self.assertIn(f"commands would be placed in: {self.bin}", proc.stdout)
        self.assertIn(f"python virtual environment:  {self.venv}", proc.stdout)
        self.assertFalse(self.bin.exists() or self.venv.exists())
        # The flag is accepted after the directories as well.
        self.assertEqual(self.run_script(self.bin, self.venv, "--check").returncode, 0)
        self.assertFalse(self.bin.exists() or self.venv.exists())

    def test_unusable_directory_stops_with_one_line_naming_the_two_argument_form(self):
        cases = {"bin": (self.blocked, self.venv), "venv": (self.bin, self.blocked)}
        for which, dirs in cases.items():
            for flags in ((), ("--check",)):
                with self.subTest(unusable=which, flags=flags):
                    proc = self.run_script(*flags, *dirs)
                    self.assertEqual(proc.returncode, 1)
                    # Not a list of tools that each could not be installed.
                    self.assertEqual(proc.stdout, "")
                    self.assertEqual(len(proc.stderr.splitlines()), 1, proc.stderr)
                    self.assertIn(f"cannot create or write to {self.blocked}", proc.stderr)
                    self.assertIn(TWO_ARG_FORM, proc.stderr)
                    self.assertFalse(self.bin.exists() or self.venv.exists())

    def test_default_directories_are_usable_or_the_reader_is_told_what_to_run(self):
        proc = self.run_script("--check")
        if proc.returncode == 0:
            self.assertIn("/usr/local/bin", proc.stdout)
            self.assertIn("/opt/sectools-venv", proc.stdout)
        else:
            self.assertEqual((proc.returncode, proc.stdout), (1, ""))
            self.assertIn("The default directories need root.", proc.stderr)
            self.assertIn(TWO_ARG_FORM, proc.stderr)

    def test_wrong_arguments_are_refused_before_anything_is_done(self):
        for args in ((self.bin, self.venv, self.tmp / "third"), ("--dry-run", self.bin, self.venv)):
            with self.subTest(args=[str(a) for a in args]):
                proc = self.run_script(*args)
                self.assertEqual((proc.returncode, proc.stdout), (2, ""))
                self.assertIn("Usage: bash scripts/install-tools.sh [--check] [BIN_DIR] [VENV_DIR]",
                              proc.stderr)
                self.assertFalse(self.bin.exists() or self.venv.exists())

    def test_help_is_the_comment_at_the_top_of_the_script(self):
        proc = self.run_script("--help")
        self.assertEqual((proc.returncode, proc.stderr), (0, ""))
        self.assertIn("Usage: bash scripts/install-tools.sh [--check] [BIN_DIR] [VENV_DIR]", proc.stdout)
        self.assertIn(TWO_ARG_FORM, proc.stdout)
        self.assertIn("Downloads are not checksum-verified", proc.stdout)
        self.assertNotIn("set -u", proc.stdout)

    def stand_in_run(self, **extra_env):
        fake_bin = self.tmp / "stand-ins"
        fake_bin.mkdir()
        for name, body in (("curl", FAKE_CURL), ("tar", FAKE_TAR), ("python3", FAKE_PYTHON),
                           ("rm", FAKE_RM)):
            (fake_bin / name).write_text(body)
            (fake_bin / name).chmod(0o755)
        scratch = self.tmp / "scratch"
        scratch.mkdir()
        calls = self.tmp / "calls"
        env = {"PATH": f"{fake_bin}{os.pathsep}{os.environ.get('PATH', '/usr/bin:/bin')}",
               "TMPDIR": str(scratch), "CALLS": str(calls), "HOME": str(self.tmp), **extra_env}
        proc = self.run_script(self.bin, self.venv, env=env)
        lines = calls.read_text().splitlines() if calls.exists() else []
        return proc, lines, scratch

    def test_downloads_go_to_a_private_directory_that_is_removed_afterwards(self):
        proc, calls, scratch = self.stand_in_run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        targets = [Path(re.search(r" -o (\S+)", line).group(1))
                   for line in calls if line.startswith("curl ")]
        self.assertEqual(len(targets), 3)
        work = {target.parent for target in targets}
        self.assertEqual(len(work), 1)                    # one directory for all downloads
        work_dir = work.pop()
        self.assertEqual(work_dir.parent, scratch)        # made by mktemp -d, under TMPDIR
        self.assertEqual([line for line in calls if line.startswith("rm ")],
                         [f"rm -rf -- {work_dir}"])
        for name in ("gitleaks", "osv-scanner", "trivy"):
            with self.subTest(tool=name):
                self.assertIn(f"[install-tools] {name} OK: stand-in 0.0", proc.stdout)
                self.assertTrue(os.access(self.bin / name, os.X_OK))
        # The virtual environment could not be made: said once per Python tool.
        for name in ("semgrep", "bandit", "pip-audit"):
            with self.subTest(tool=name):
                self.assertIn(f"[install-tools] {name} BLOCKED: 'python3 -m venv {self.venv}' failed",
                              proc.stdout)

    def test_failed_downloads_are_reported_per_tool_and_do_not_fail_the_run(self):
        proc, calls, _ = self.stand_in_run(FAKE_CURL_FAILS="1")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        for name in ("gitleaks", "osv-scanner", "trivy"):
            with self.subTest(tool=name):
                self.assertIn(f"[install-tools] {name} BLOCKED: download failed", proc.stdout)
                self.assertFalse((self.bin / name).exists())
        self.assertNotIn(" OK: ", proc.stdout)


def load_script(name: str):
    spec = importlib.util.spec_from_file_location(f"fsl_{name}_script",
                                                  ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)       # defines functions only; the work runs from main()
    return module


def load_acceptance_script():
    return load_script("acceptance")


def make_output(*args: str) -> str:
    """What `make ARGS` prints, the same however the suite itself was started.
    Under "make test" an inner make would inherit the outer one's settings and
    print "Entering directory" and "Leaving directory" lines around its output."""
    env = {key: value for key, value in os.environ.items()
           if key not in ("MAKEFLAGS", "MFLAGS", "MAKELEVEL")}
    proc = subprocess.run(["make", "--no-print-directory", *args], cwd=str(ROOT), env=env,
                          capture_output=True, text=True, timeout=60)
    if proc.returncode != 0:
        raise AssertionError(f"make {' '.join(args)} failed: {proc.stderr}")
    return proc.stdout


class TestAcceptanceReportLocation(unittest.TestCase):
    """Running the gates must not modify a tracked file."""

    @classmethod
    def setUpClass(cls):
        cls.script = load_acceptance_script()

    def test_default_run_writes_only_the_untracked_report(self):
        args = self.script.parse_args([])
        self.assertFalse(args.evidence)
        self.assertEqual(self.script.report_paths(args.evidence),
                         [ROOT / "var" / "acceptance-report.json"])

    def test_evidence_option_also_writes_the_tracked_copy(self):
        args = self.script.parse_args(["--evidence"])
        self.assertTrue(args.evidence)
        self.assertEqual(self.script.report_paths(args.evidence),
                         [ROOT / "var" / "acceptance-report.json",
                          ROOT / "evidence" / "acceptance-report.json"])

    def test_report_is_written_to_every_path_given(self):
        tmp = Path(tempfile.mkdtemp(prefix="fsl-report-"))
        paths = [tmp / "new-dir" / "a.json", tmp / "b.json"]
        report = {"score": "10/10", "note": "ملاحظة"}
        self.script.write_report(report, paths)
        for path in paths:
            with self.subTest(path=path.name):
                self.assertEqual(json.loads(path.read_text(encoding="utf-8")), report)

    @unittest.skipUnless(in_a_git_checkout(), "needs git and a checkout")
    def test_git_ignores_the_default_report_and_tracks_the_evidence_copy(self):
        default = "faisal-security-lab/var/acceptance-report.json"
        self.assertEqual(git("check-ignore", "-q", "--no-index", default).returncode, 0)
        self.assertEqual(git("ls-files", "--", default).stdout, "")
        tracked = "faisal-security-lab/evidence/acceptance-report.json"
        self.assertEqual(git("ls-files", "--", tracked).stdout.strip(), tracked)

    def check_make_targets(self):
        self.assertRegex(make_output("-n", "acceptance"), r"scripts/acceptance\.py\s*$")
        self.assertRegex(make_output("-n", "acceptance-evidence"),
                         r"scripts/acceptance\.py --evidence\s*$")
        listed = make_output("help")
        self.assertRegex(listed, r"make acceptance +.*var/acceptance-report\.json")
        self.assertRegex(listed, r"make acceptance-evidence +.*evidence/acceptance-report\.json")

    @unittest.skipUnless(shutil.which("make"), "needs make")
    def test_make_targets_choose_between_the_two(self):
        self.check_make_targets()

    @unittest.skipUnless(shutil.which("make"), "needs make")
    def test_make_targets_read_the_same_when_make_started_the_suite(self):
        # What a recipe of "make test" hands to the commands it starts.
        with mock.patch.dict(os.environ, {"MAKELEVEL": "1", "MAKEFLAGS": "w", "MFLAGS": "-w"}):
            self.check_make_targets()


@unittest.skipUnless(shutil.which("make"), "needs make")
class TestMakefile(unittest.TestCase):
    def test_help_names_every_tool_the_install_script_installs(self):
        script = INSTALL.read_text(encoding="utf-8")
        installed = re.search(r"^for t in ([a-z -]+); do$", script, re.M).group(1).split()
        self.assertEqual(sorted(installed), ["bandit", "gitleaks", "osv-scanner", "pip-audit",
                                             "semgrep", "trivy"])
        line = next(line for line in make_output("help").splitlines()
                    if "make install-tools" in line)
        for tool in installed:
            with self.subTest(tool=tool):
                self.assertIn(tool, line)
        # The script goes on without Trivy, and says so; the help does too.
        self.assertIn("trivy BLOCKED: download failed (optional", script)
        self.assertIn("trivy is optional", line)

    def test_clean_removes_the_compiled_files_of_every_python_directory(self):
        planned = make_output("-n", "clean")
        for directory in ("app", "app/connectors", "app/ai", "tests", "scripts"):
            with self.subTest(directory=directory):
                self.assertTrue((ROOT / directory).is_dir())
                self.assertRegex(planned, rf"(^|\s){re.escape(directory)}/__pycache__(\s|$)")


class TestVerifyTable(unittest.TestCase):
    """`make verify` prints a table whose last column is free text."""

    @classmethod
    def setUpClass(cls):
        cls.script = load_script("verify")

    def test_a_long_detail_is_wrapped_between_words_and_not_cut(self):
        # What the AI red-team connector reports when no provider is set.
        detail = ("blocked: no AI provider configured "
                  "(set FSL_AI_PROVIDER/FSL_AI_MODEL/FSL_AI_API_KEY)")
        self.assertIn(detail, (ROOT / "app" / "ai" / "redteam.py").read_text(encoding="utf-8"))
        lines = self.script.table_row("ai_redteam", "api", "installed", "probes=4",
                                      detail).splitlines()
        self.assertGreater(len(lines), 1)
        self.assertTrue(lines[0].startswith("ai_redteam        api      installed   probes=4"))
        column = self.script.DETAIL_AT
        # Every word is whole: the lines put together again are the detail.
        self.assertEqual(" ".join(line[column:] for line in lines), detail)
        for line in lines[1:]:
            self.assertEqual(line[:column].strip(), "")   # continues under its own column

    def test_a_short_detail_stays_on_the_row(self):
        row = self.script.table_row("bandit", "cli", "ready", "bandit 1.9.4", "resolved on PATH")
        self.assertEqual(row, "bandit            cli      ready       bandit 1.9.4"
                              "                resolved on PATH")
        self.assertEqual(self.script.table_row("trivy", "cli", "blocked", "-", "").rstrip(),
                         "trivy             cli      blocked     -")


class TestLicenceLabels(unittest.TestCase):
    """The licence shown for a connector is the licence of what it runs."""

    def test_connectors_that_are_the_projects_own_code_carry_the_project_licence(self):
        from app.connectors import get_connector
        from app.version import PROJECT_LICENSE
        self.assertEqual(PROJECT_LICENSE, "MIT OR Apache-2.0")
        root = Path(__file__).resolve().parent.parent
        for name in ("LICENSE-APACHE", "LICENSE-MIT", "NOTICE", "THIRD-PARTY-NOTICES.md"):
            self.assertTrue((root / name).is_file(), name)
        self.assertIn("Apache License", (root / "LICENSE-APACHE").read_text(encoding="utf-8")[:200])
        self.assertIn("MIT License", (root / "LICENSE-MIT").read_text(encoding="utf-8")[:40])
        for name in ("http_headers", "tls_certificate", "ai_redteam"):
            with self.subTest(connector=name):
                self.assertEqual(get_connector(name).license, PROJECT_LICENSE)

    def test_connectors_that_run_an_external_tool_carry_that_tools_licence(self):
        from app.connectors import get_connector
        # Semgrep 1.185.0 declares "License-Expression: LGPL-2.1-or-later".
        expected = {"semgrep": "LGPL-2.1-or-later", "bandit": "Apache-2.0",
                    "pip_audit": "Apache-2.0", "gitleaks": "MIT", "osv_scanner": "Apache-2.0",
                    "trivy": "Apache-2.0"}
        for name, licence in expected.items():
            with self.subTest(connector=name):
                self.assertEqual(get_connector(name).license, licence)


class TestConsoleTexts(unittest.TestCase):
    def setUp(self):
        self.js = (ROOT / "web" / "app.js").read_text(encoding="utf-8")

    def test_generated_password_is_described_as_shown_once_in_both_languages(self):
        texts = re.findall(r'owner_password_generated: "([^"]*)"', self.js)
        self.assertEqual(len(texts), 2)
        arabic, english = texts
        self.assertIn("مرة واحدة فقط", arabic)
        self.assertIn("shown once", english)
        for text in texts:
            self.assertNotIn("one-time", text.lower())
            self.assertNotIn("لمرة واحدة", text)

    def test_scan_form_texts_exist_in_both_languages(self):
        for key in ("needscantype", "noscantypes", "inscope", "notinscope"):
            with self.subTest(key=key):
                self.assertEqual(len(re.findall(rf'\b{key}:"', self.js)), 2)


KEY_AND_ARCHIVE_PATTERNS = ("*.pem", "*.key", "id_rsa*", "id_ed25519*", "*.ppk", "*.p12", "*.pfx",
                            "*.zip", "*.tar", "*.tar.gz", "*.tgz", "*.7z")


class TestRepositoryIgnoreFiles(unittest.TestCase):
    def test_key_material_and_archives_are_ignored_at_the_repository_root(self):
        lines = (REPO / ".gitignore").read_text(encoding="utf-8").splitlines()
        for pattern in KEY_AND_ARCHIVE_PATTERNS:
            with self.subTest(pattern=pattern):
                self.assertIn(pattern, lines)

    @unittest.skipUnless(in_a_git_checkout(), "needs git and a checkout")
    def test_the_patterns_catch_such_files_anywhere_and_no_tracked_file(self):
        for path in ("server.pem", "faisal-security-lab/deploy/tls.key", "id_rsa", "id_rsa.pub",
                     "keys/id_ed25519", "putty.ppk", "client.p12", "client.pfx", "upload.zip",
                     "site.tar", "faisal-security-lab/backup.tar.gz", "old.tgz", "old.7z"):
            with self.subTest(path=path):
                self.assertEqual(git("check-ignore", "-q", "--no-index", path).returncode, 0)
        self.assertEqual(git("check-ignore", "-q", "--no-index",
                             "faisal-security-lab/.env.example").returncode, 1)
        self.assertEqual(git("ls-files", "-ci", "--exclude-standard").stdout, "")

    def test_scanner_ignore_file_lists_only_history_entries_for_the_planted_strings(self):
        lines = (REPO / ".gitleaksignore").read_text(encoding="utf-8").splitlines()
        comments = [line for line in lines if line.startswith("#")]
        entries = [line for line in lines if line.strip() and not line.startswith("#")]
        self.assertIn("fabricated", " ".join(comments))
        self.assertEqual(len(entries), 6)
        self.assertEqual(len(set(entries)), 6)
        # <commit>:<file>:<rule id>:<line>. An entry without the commit would
        # also apply to a scan of the files, which the demo scan must keep finding.
        shape = re.compile(r"[0-9a-f]{40}:faisal-security-lab/"
                           r"(samples/vulnerable-app/app\.py|tests/test_platform\.py|scripts/acceptance\.py)"
                           r":[a-z0-9-]+:[0-9]+")
        for entry in entries:
            with self.subTest(entry=entry):
                self.assertRegex(entry, shape)
                self.assertIsNotNone(shape.fullmatch(entry))

    @unittest.skipUnless(shutil.which("gitleaks"), "gitleaks not installed")
    def test_a_scan_of_the_sample_files_still_reports_the_planted_strings(self):
        # Run from the repository root, where the ignore file is picked up.
        report = Path(tempfile.mkdtemp(prefix="fsl-leaks-")) / "report.json"
        proc = subprocess.run(
            ["gitleaks", "dir", str(ROOT / "samples" / "vulnerable-app"), "--redact",
             "--report-format", "json", "--report-path", str(report), "--exit-code", "0",
             "--no-banner"], cwd=str(REPO), capture_output=True, text=True, timeout=120)
        if proc.returncode != 0 and "unknown command" in proc.stderr:
            self.skipTest("this gitleaks has no 'dir' command")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        found = {(Path(leak["File"]).name, leak["RuleID"])
                 for leak in json.loads(report.read_text(encoding="utf-8") or "[]")}
        self.assertIn(("app.py", "github-pat"), found)


if __name__ == "__main__":
    unittest.main(verbosity=2)
