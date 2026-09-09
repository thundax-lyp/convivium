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

    def test_heading_formats_and_fenced_examples(self):
        result = checker["anchors"](
            "# `Code` **title**\n# Repeat\n# Repeat\n# Repeat-1\n"
            "Setext\n======\n~~~md\n# Example\n~~~\n"
        )
        self.assertEqual(result, {"code-title", "repeat", "repeat-1", "repeat-1-1", "setext"})


if __name__ == "__main__":
    unittest.main()
