"""Static checks on the console files in web/. Nothing is started: the files
are read as text and compared with what the server can answer."""
from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
ARABIC = re.compile(r"[؀-ۿ]")


def policy_codes() -> set[str]:
    """Every refusal code app/policy.py can return: the code of each
    Decision(False, reason, code) written there."""
    tree = ast.parse((ROOT / "app" / "policy.py").read_text(encoding="utf-8"))
    codes = set()
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and getattr(node.func, "id", "") == "Decision"):
            continue
        args = node.args
        if not (args and isinstance(args[0], ast.Constant) and args[0].value is False):
            continue
        code = args[2] if len(args) > 2 else next(
            (k.value for k in node.keywords if k.arg == "code"), None)
        if not (isinstance(code, ast.Constant) and isinstance(code.value, str)):
            raise AssertionError(f"policy.py line {node.lineno}: the code is not a plain string")
        codes.add(code.value)
    return codes


def text_table(name: str) -> dict[str, dict[str, str]]:
    """The texts of `const NAME = { ar: { key: "text", ... }, en: { ... } };`
    in app.js, as {"ar": {key: text}, "en": {key: text}}."""
    block = re.search(rf"^const {name} = \{{\n(.*?)\n\}};", JS, re.S | re.M)
    if block is None:
        return {}
    table = {}
    for lang, body in re.findall(r"^  (ar|en): \{\n(.*?)\n  \}", block.group(1), re.S | re.M):
        table[lang] = dict(re.findall(r'^\s*(\w+): "((?:[^"\\]|\\.)*)",?$', body, re.M))
    return table


def label(key: str) -> list[str]:
    """The texts of one key of the console's label table, Arabic first."""
    return re.findall(rf'\b{key}:"([^"]*)"', JS)


class TestPolicyRefusalTexts(unittest.TestCase):
    def test_the_codes_are_read_from_the_policy_engine(self):
        codes = policy_codes()
        self.assertNotIn("ok", codes)
        for code in ("connector_not_authorized", "target_scope", "scope_inactive", "window",
                     "global_stop", "prod_active_blocked", "project_isolation", "scope_mismatch"):
            with self.subTest(code=code):
                self.assertIn(code, codes)

    def test_every_policy_code_has_a_text_in_both_languages(self):
        table = text_table("POLICY_TEXT")
        self.assertEqual(sorted(table), ["ar", "en"])
        for code in sorted(policy_codes()):
            for lang in ("ar", "en"):
                with self.subTest(code=code, lang=lang):
                    self.assertTrue(table[lang].get(code, "").strip())

    def test_the_arabic_texts_are_arabic_and_the_english_ones_are_not(self):
        table = text_table("POLICY_TEXT")
        self.assertTrue(table)
        for code, text in table["ar"].items():
            with self.subTest(code=code, lang="ar"):
                self.assertRegex(text, ARABIC)
        for code, text in table["en"].items():
            with self.subTest(code=code, lang="en"):
                self.assertNotRegex(text, ARABIC)

    def test_what_was_refused_and_what_is_allowed_are_labelled_in_both_languages(self):
        for key in ("refused", "authallows", "dirhint"):
            with self.subTest(key=key):
                texts = label(key)
                self.assertEqual(len(texts), 2)
                self.assertRegex(texts[0], ARABIC)
                self.assertNotRegex(texts[1], ARABIC)
        # The hint names the place where the console puts the example entry.
        for text in label("dirhint"):
            self.assertIn("{entry}", text)


class TestFirstProject(unittest.TestCase):
    def test_empty_state_texts_exist_in_both_languages(self):
        for key in ("noprojects", "firstproject"):
            with self.subTest(key=key):
                texts = label(key)
                self.assertEqual(len(texts), 2)
                self.assertRegex(texts[0], ARABIC)
                self.assertNotRegex(texts[1], ARABIC)

    def test_an_empty_project_list_starts_with_a_placeholder(self):
        # "+ New project" as the only entry would already be selected, and
        # choosing the selected entry of a list does nothing.
        self.assertIn('<option value="" disabled selected>', JS)

    def test_the_form_is_shown_while_a_signed_in_user_has_no_project(self):
        shown = re.search(r"if \(!S\.project && S\.token && (.*)\n\s*return setMain\(ctx, (.*)\);", JS)
        self.assertIsNotNone(shown)
        self.assertIn('"dashboard"', shown.group(1))
        self.assertIn('projectForm(t("firstproject"))', shown.group(2))


class TestScanForm(unittest.TestCase):
    def test_a_scope_is_listed_by_its_scan_types_first_then_the_asset_identifier(self):
        # A phone shows only the start of the closed list, and the bare id of
        # an asset tells the user nothing.
        line = re.search(r"^\s*const scopeLabel = .*$", JS, re.M)
        self.assertIsNotNone(line)
        label = line.group(0)
        self.assertIn("ident(s.asset_id)", label)
        self.assertLess(label.index("scan_types"), label.index("asset_id"))

    def test_the_line_under_the_form_is_a_hint_in_both_languages(self):
        texts = label("scanhint")
        self.assertEqual(len(texts), 2)
        self.assertRegex(texts[0], ARABIC)
        self.assertNotRegex(texts[1], ARABIC)

    def test_the_form_no_longer_states_a_refusal_before_anything_was_asked(self):
        self.assertNotIn("Not authorized — check scope.", JS)
        self.assertNotIn("غير مصرح — راجع النطاق.", JS)


class TestUnavailableScreen(unittest.TestCase):
    def test_it_offers_the_owner_sign_in(self):
        body = re.search(r"^function renderUnavailable\(\)\{\n(.*?)^\}", JS, re.S | re.M)
        self.assertIsNotNone(body)
        self.assertIn('data-act="showlogin"', body.group(1))
        self.assertIn('data-act="reload"', body.group(1))


if __name__ == "__main__":
    unittest.main()
