"""Behavior checks for the documentation gate, using an isolated Git repository."""

import runpy
import subprocess
import tempfile
import unittest
from pathlib import Path


checker = runpy.run_path(str(Path(__file__).with_name("check-doc-links.py")))


class DocumentLinksTest(unittest.TestCase):
    def test_repository_links_and_diagnostics(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "target.md").write_text("# 中文 Title\n# Repeat\n# Repeat\n")
            (root / "source.md").write_text(
                "[valid](target.md#中文-title)\n"
                "[duplicate](target.md#repeat-1)\n"
                "[encoded](target.md#%E4%B8%AD%E6%96%87-title)\n"
                "[remote](https://example.invalid/missing)\n"
                "`[example](missing.md)`\n"
                "```md\n[example](missing.md)\n```\n"
                "[reference]: target.md#repeat\n"
            )
            count, errors = checker["check"](root)
            self.assertEqual((count, errors), (4, []))
            with (root / "source.md").open("a") as file:
                file.write("[deleted](missing.md)\n[renamed](target.md#old-title)\n")
            _, errors = checker["check"](root)
            self.assertEqual(len(errors), 2)
            self.assertIn("source.md:10: missing target", errors[0])
            self.assertIn("source.md:11: missing anchor", errors[1])

    def test_balanced_and_escaped_destinations_reach_real_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "guide_(old).md").write_text("# Guide\n")
            (root / "nested_(one_(two)).md").write_text("# Nested\n")
            (root / "source.md").write_text(
                '[guide](guide_(old).md#guide "Title")\n'
                '[nested](nested_(one_(two)).md)\n'
                r'[escaped](guide_\(old\).md)' + "\n"
                '[angle](<guide_(old).md>)\n'
                '[ref]: guide_(old).md "Title"\n'
                '[missing](missing_(old).md)\n'
            )
            count, errors = checker["check"](root)
            self.assertEqual(count, 6)
            self.assertEqual(errors, ["source.md:6: missing target: missing_(old).md"])

    def test_rendered_heading_entities_and_reference_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "target.md").write_text(
                "# Fish &amp; Chips\n# Fish &#38; Chips\n"
                "# [Guide][ref]\n# [Collapsed][]\n# [Unknown][missing]\n"
                "# `&amp;`\n# [Inline](guide_(old).md)\n"
                "[ref]: https://example.invalid\n"
                "[Collapsed]: https://example.invalid\n"
            )
            (root / "guide_(old).md").write_text("# Guide\n")
            (root / "source.md").write_text(
                "[a](target.md#fish--chips)\n[b](target.md#fish--chips-1)\n"
                "[c](target.md#guide)\n[d](target.md#collapsed)\n"
                "[e](target.md#unknownmissing)\n[f](target.md#amp)\n"
                "[g](target.md#inline)\n"
                "[bad entity](target.md#fish-amp-chips)\n"
                "[bad reference](target.md#guideref)\n"
            )
            _, errors = checker["check"](root)
            self.assertEqual(errors, [
                "source.md:8: missing anchor: target.md#fish-amp-chips",
                "source.md:9: missing anchor: target.md#guideref",
            ])

    def test_indented_examples_are_ignored_but_paragraph_continuations_are_checked(self):
        self.assertEqual(list(checker["links"](
            "    [sample](missing.md)\n\n\t[sample](missing.md)\n\n"
            "Paragraph\n    [real](target.md)\n\n[real](other.md)\n"
        )), [(6, "target.md"), (8, "other.md")])

    def test_existing_targets_outside_repository_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            root = parent / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            outside = parent / "outside.md"
            outside.write_text("# Outside\n")
            (root / "escape.md").symlink_to(outside)
            (root / "source.md").write_text(
                f"[absolute]({outside})\n[relative](../outside.md)\n"
                "[symlink](escape.md)\n"
            )
            count, errors = checker["check"](root)
            self.assertEqual(count, 3)
            self.assertEqual(len(errors), 3)
            self.assertTrue(all("target outside repository" in e for e in errors))

    def test_heading_formats_and_fenced_examples(self):
        result = checker["anchors"](
            "# `Code` **title**\n# Repeat\n# Repeat\n# Repeat-1\n"
            "Setext\n======\n~~~md\n# Example\n~~~\n"
        )
        self.assertEqual(result, {"code-title", "repeat", "repeat-1", "repeat-1-1", "setext"})


if __name__ == "__main__":
    unittest.main()
