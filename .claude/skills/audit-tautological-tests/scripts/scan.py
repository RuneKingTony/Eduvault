#!/usr/bin/env python3
"""Flag tests that cannot fail, or that pin things that are not behaviour.

usage: scan.py [--limit N] [--json] <dir-or-file>...
Run from the repo root: paths are resolved with `git ls-files`, so untracked files are skipped.
Output is file:line candidates for a human or agent to read, never a verdict.
"""
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

START = re.compile(r'^[ \t]*(?:it|test)(?:\.each(?:<[^>]*>)?\((?:[^()]|\([^()]*\))*\))?\(\s*([\'"`])(.+?)\1', re.M)
EXPECT = re.compile(r'\bexpect\(.*?;', re.S)
WEAK = re.compile(
    r'\.(?:toBeDefined|toBeTruthy|toBeFalsy)\(\)|\.not\.(?:toBeNull|toBeUndefined)\(\)|expect\.anything\(\)'
)
SPY = re.compile(r'toHaveBeenCalled|toHaveBeenNthCalledWith|toHaveBeenLastCalledWith')
PRESENCE = re.compile(r'toBeInTheDocument\(\)|toBeVisible\(\)')
PINS = re.compile(
    r'toHaveClass|expect\([^)]*\.className|toMatchSnapshot|toMatchInlineSnapshot|ByTestId|'
    r'container\.(?:querySelector|firstChild)|\.closest\(|data-slot|\.querySelector\('
)
OUTCOME = re.compile(r'\bawait\s+screen\.(?:find\w+)\(|\bawait\s+screen\.findBy')
FAKE_VAR = re.compile(r'\b(?:const|let)\s+(\w+)\s*=\s*new\s+Fake\w+')
ECHO = re.compile(r'\.(?:toEqual|toBe|toStrictEqual|toMatchObject)\(\s*(\w+)\.\w+\s*\)')
FAKE_STATE = re.compile(r'expect\(\s*(\w+)\.\w+\s*\)')
CLASS_ONLY = re.compile(r'(?:toThrow|toBeInstanceOf)\(\s*\w+Exception\s*\)')
IGNORED_SCOPE = re.compile(r'^\s*(?:async\s+)?\w+\(\s*_(?:scope|organizationId)\b.*$', re.M)


def tracked(targets, pattern):
    out = subprocess.check_output(['git', 'ls-files', *targets], text=True).split()
    return [f for f in out if re.search(pattern, f)]


def line_of(src, pos):
    return src.count('\n', 0, pos) + 1


def scan_spec(path):
    src = Path(path).read_text()
    marks = list(START.finditer(src))
    fakes = set(FAKE_VAR.findall(src))
    found = defaultdict(list)
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(src)
        body = src[m.end():end]
        where = (path, line_of(src, m.start()), m.group(2))
        expects = EXPECT.findall(body)
        if not expects:
            found['no-expect'].append(where)
            continue
        if all(WEAK.search(e) for e in expects):
            found['weak-only'].append(where)
        if all(SPY.search(e) for e in expects) and not OUTCOME.search(body):
            found['spy-only'].append(where)
        if len(expects) == 1 and PRESENCE.search(expects[0]):
            found['single-presence'].append(where)
        if PINS.search(body):
            found['pins-structure'].append(where)
        if any(m2.group(1) in fakes for e in expects for m2 in [ECHO.search(e)] if m2):
            found['echoes-fake'].append(where)
        if any(m2.group(1) in fakes for e in expects for m2 in [FAKE_STATE.search(e)] if m2):
            found['asserts-fake-state'].append(where)
        if all(CLASS_ONLY.search(e) for e in expects):
            found['class-only-error'].append(where)
    return len(marks), found


def scan_fake(path):
    src = Path(path).read_text()
    return [(path, line_of(src, m.start()), ' '.join(m.group(0).split())) for m in IGNORED_SCOPE.finditer(src)]


def main(argv):
    limit, as_json, targets = 8, False, []
    it = iter(argv)
    for arg in it:
        if arg == '--limit':
            limit = int(next(it))
        elif arg == '--json':
            as_json = True
        else:
            targets.append(arg)
    if not targets:
        sys.exit(__doc__)
    total, flags = 0, defaultdict(list)
    for f in tracked(targets, r'\.(?:spec|test)\.tsx?$'):
        n, found = scan_spec(f)
        total += n
        for kind, items in found.items():
            flags[kind].extend(items)
    for f in tracked(targets, r'(?:^|/)fake-[\w.-]+\.tsx?$'):
        flags['fake-ignores-scope'].extend(scan_fake(f))
    if as_json:
        print(json.dumps({'tests': total, 'flags': flags}, indent=2))
        return
    print(f'{total} tests scanned (an it.each counts once)')
    for kind, items in sorted(flags.items(), key=lambda kv: -len(kv[1])):
        print(f'\n{kind}: {len(items)}')
        for f, line, title in items[:limit]:
            print(f'  {f}:{line} | {title}')


if __name__ == '__main__':
    main(sys.argv[1:])
