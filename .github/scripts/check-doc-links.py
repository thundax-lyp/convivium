"""Check repository Markdown local links; no network or third-party dependencies."""

import html
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


def prose(source):
    """Remove code blocks while retaining line numbers for diagnostics."""
    fence = None
    indented = False
    previous_blank = True
    lines = []
    list_indents = []
    for line in source.splitlines():
        line = line.expandtabs(4)
        indent = len(line) - len(line.lstrip(" "))
        if line.strip() and not fence:
            while list_indents and indent < list_indents[-1]:
                list_indents.pop()
        content = line[list_indents[-1]:] if list_indents else line
        item = re.match(r"^ {0,3}(?:[-+*]|[0-9]{1,9}[.)])( +)(?=\S)", content)
        if item and not fence:
            list_indents.append((list_indents[-1] if list_indents else 0) + item.end())
            content = content[item.end():]
        # Code indentation is relative to the containing list item's content.
        line = content
        marker = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence):
                fence = None
            lines.append("")
        elif marker:
            fence = marker[1]
            lines.append("")
        elif line.startswith(("    ", "\t")) and (indented or previous_blank):
            indented = True
            lines.append("")
        else:
            if line.strip():
                indented = False
            lines.append(line)
        previous_blank = not line.strip()
    return "\n".join(lines)


def destination(text, start):
    """Read a Markdown destination, balancing unescaped parentheses."""
    angle = text[start:start + 1] == "<"
    pos = start + int(angle)
    begin, depth = pos, 0
    while pos < len(text):
        char = text[pos]
        if char == "\\" and pos + 1 < len(text):
            pos += 2
            continue
        if angle:
            if char == ">":
                return text[begin:pos], pos + 1
            if char in "<\n":
                return None
        else:
            if char.isspace() or (char == ")" and depth == 0):
                break
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
        pos += 1
    if angle or depth:
        return None
    return text[begin:pos], pos


def inline_links(text):
    for match in re.finditer(r"!?\[([^]\n]*)\]\(\s*", text):
        parsed = destination(text, match.end())
        if parsed:
            target, end = parsed
            closing = re.match(
                r"(?:\s+(?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|"
                r"\((?:\\.|[^()\\])*\)))?\s*\)", text[end:]
            )
            if closing:
                yield match.start(), end + closing.end(), match[1], target


def label_key(label):
    return " ".join(label.split()).casefold()


def heading_text(title, references):
    # Mask code spans without breaking the surrounding link syntax. Restore
    # literal code only after parsing links and decoding ordinary heading text.
    prefix = "\ue000"
    while prefix in title:
        prefix += "\ue000"
    spans = {}

    def mask(match):
        token = f"{prefix}{len(spans)}\ue001"
        spans[token] = (match[0], match[2])
        return token

    def restore(text, literal=True):
        for token, (markup, code) in spans.items():
            text = text.replace(token, code if literal else markup)
        return text

    text = re.sub(r"(`+)(.*?)\1", mask, title)
    for start, end, label, _ in reversed(list(inline_links(text))):
        text = text[:start] + label + text[end:]
    text = re.sub(
        r"!?\[([^]]+)\]\[([^]]*)\]",
        lambda m: m[1] if label_key(restore(m[2] or m[1], literal=False)) in references else m[0],
        text,
    )
    text = re.sub(
        r"<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*|"
        r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+)>",
        r"\1", text,
    )
    text = re.sub(r"<[^>]+>", "", text)
    return restore(html.unescape(text))


def anchors(source):
    used = set()
    lines = prose(source).splitlines()
    references = {label_key(label) for _, label, _ in reference_definitions(lines)}
    for i, line in enumerate(lines):
        heading = re.match(r"^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$", line)
        title = heading[1] if heading else None
        if i + 1 < len(lines) and re.fullmatch(r" {0,3}(?:=+|-+)\s*", lines[i + 1]) and line.strip():
            title = line.strip()
        if title is None:
            continue
        title = heading_text(title, references)
        slug = re.sub(r"[^\w\- ]", "", title.lower()).replace(" ", "-")
        candidate, suffix = slug, 0
        while candidate in used:
            suffix += 1
            candidate = f"{slug}-{suffix}"
        used.add(candidate)
    used.update(re.findall(r'\b(?:id|name)=["\']([^"\']+)["\']', prose(source)))
    return used


def decode_destination(target):
    return html.unescape(re.sub(r"\\([!\"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])", r"\1", target))


def reference_definitions(lines):
    for index, line in enumerate(lines):
        definition = re.match(r"^ {0,3}\[([^]]+)\]:[ \t]*", line)
        if not definition:
            continue
        rest = line[definition.end():]
        if not rest and index + 1 < len(lines):
            rest = lines[index + 1].lstrip()
        if rest and (parsed := destination(rest, 0)):
            yield index + 1, definition[1], parsed[0]


def links(source):
    lines = prose(source).splitlines()
    found = []
    for number, line in enumerate(lines, 1):
        line = re.sub(r"(`+).*?\1", "", line)
        for _, _, _, target in inline_links(line):
            found.append((number, decode_destination(target)))
    for number, _, target in reference_definitions(lines):
        found.append((number, decode_destination(target)))
    yield from sorted(found, key=lambda item: item[0])


def check(root):
    names = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
    ).decode().split("\0")
    root = root.resolve()
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
            if not linked.is_relative_to(root):
                errors.append(f"{name}:{line}: target outside repository: {target}")
            elif not linked.exists():
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
