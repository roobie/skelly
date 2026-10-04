#!/usr/bin/env python3
"""Print each tracked doc's read_if reasons, read from the docs when it runs.

Usage:
  python3 tools/read_if.py              every doc with read_if, and its reasons
  python3 tools/read_if.py TERM ...     only docs with a reason containing a TERM
  python3 tools/read_if.py --missing    tracked docs without read_if

Reads only the front matter: a block list (`- reason`) or a flow list
(`[a, "b, c"]`). Standard library only, so any clone can run it.
"""

import csv
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def tracked_docs():
    listed = subprocess.run(
        ["git", "ls-files", "-z", "*.md"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [path for path in listed.split("\0") if path and (ROOT / path).is_file()]


def front_matter(text):
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    for end, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return lines[1:end]
    return None


def unquote(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def read_if(lines):
    for start, line in enumerate(lines):
        if not line.startswith("read_if:"):
            continue
        inline = line[len("read_if:") :].strip()
        if inline.startswith("[") and inline.endswith("]"):
            row = next(csv.reader([inline[1:-1]], skipinitialspace=True), [])
            return [unquote(cell) for cell in row if cell.strip()]
        reasons = []
        for item in lines[start + 1 :]:
            text = item.strip()
            if not item.startswith((" ", "\t", "-")):
                break
            if text.startswith("- "):
                reasons.append(unquote(text[2:]))
            elif text and reasons:
                # A reason wrapped onto an indented continuation line.
                reasons[-1] = f"{reasons[-1]} {text}"
        return reasons
    return None


def main(args):
    if "-h" in args or "--help" in args:
        print(__doc__.strip())
        return 0
    missing_only = "--missing" in args
    terms = [arg.lower() for arg in args if arg != "--missing"]
    for path in tracked_docs():
        lines = front_matter((ROOT / path).read_text(encoding="utf-8"))
        reasons = read_if(lines) if lines else None
        if missing_only:
            if not reasons:
                print(path)
            continue
        if not reasons:
            continue
        if terms and not any(term in reason.lower() for reason in reasons for term in terms):
            continue
        print(path)
        for reason in reasons:
            print(f"  - {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
