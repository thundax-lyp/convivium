"""Check repository Markdown local links; no network or third-party dependencies."""

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


def prose(source):
    """Remove fenced code while retaining line numbers for diagnostics."""
    fence = None
    lines = []
    for line in source.splitlines():
        marker = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence):
                fence = None
            lines.append("")
        elif marker:
            fence = marker[1]
            lines.append("")
        else:
            lines.append(line)
    return "\n".join(lines)


def anchors(source):
    used = set()
    lines = prose(source).splitlines()
    for i, line in enumerate(lines):
        heading = re.match(r"^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$", line)
        title = heading[1] if heading else None
        if i + 1 < len(lines) and re.fullmatch(r" {0,3}(?:=+|-+)\s*", lines[i + 1]) and line.strip():
            title = line.strip()
        if title is None:
            continue
        title = re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", title)
        title = re.sub(r"<[^>]+>", "", title)
        slug = re.sub(r"[^\w\- ]", "", title.lower()).replace(" ", "-")
        candidate, suffix = slug, 0
        while candidate in used:
            suffix += 1
            candidate = f"{slug}-{suffix}"
        used.add(candidate)
    used.update(re.findall(r'\b(?:id|name)=["\']([^"\']+)["\']', prose(source)))
    return used


def links(source):
    text = prose(source)
    # Destinations used by this repository: bare URLs or <angle-bracket paths>.
    destination = r'(<[^>\n]+>|[^\s)]+)'
    for number, line in enumerate(text.splitlines(), 1):
        line = re.sub(r"(`+).*?\1", "", line)
        for match in re.finditer(r"!?\[[^]\n]*\]\(" + destination + r'(?:\s+["\'][^\n]*["\'])?\)', line):
            yield number, match[1].strip("<>")
        definition = re.match(r"^ {0,3}\[[^]]+\]:\s*" + destination, line)
        if definition:
            yield number, definition[1].strip("<>")


def check(root):
    names = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
    ).decode().split("\0")
    count, errors, cache = 0, [], {}
    for name in sorted(set(names)):
        path = root / name
        if path.suffix.lower() != ".md" or not path.is_file():
            continue
        for line, target in links(path.read_text()):
            url = urlsplit(target)
            if url.scheme or url.netloc:
                continue
            count += 1
            linked = (path.parent / unquote(url.path)).resolve() if url.path else path.resolve()
            if not linked.exists():
                errors.append(f"{name}:{line}: missing target: {target}")
            elif url.fragment and linked.suffix.lower() == ".md":
                if linked not in cache:
                    cache[linked] = anchors(linked.read_text())
                if unquote(url.fragment) not in cache[linked]:
                    errors.append(f"{name}:{line}: missing anchor: {target}")
    return count, errors


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    count, errors = check(root)
    for error in errors:
        print(error, file=sys.stderr)
    print(f"Markdown local links: {count} checked, {len(errors)} errors")
    sys.exit(bool(errors))
