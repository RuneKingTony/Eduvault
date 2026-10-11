"""Pick the e2e screenshots safe to publish, and render them as a PR comment. See evidence.sh.
usage:
  evidence.py select <e2e.json> <run_dir> <start_epoch>
      stdout: JSON list of {path, name, caption, ac}; stderr: one line per file left out and why
  evidence.py render <run> <verdict> <omitted>      stdin: JSON list with a url per entry; stdout: the comment
env: EVIDENCE_MAX_COUNT (12), EVIDENCE_MAX_FILE_BYTES (1500000), EVIDENCE_MAX_TOTAL_BYTES (12000000)
"""
import json, os, re, sys

MAX_COUNT = int(os.environ.get("EVIDENCE_MAX_COUNT", 12))
MAX_FILE = int(os.environ.get("EVIDENCE_MAX_FILE_BYTES", 1_500_000))
MAX_TOTAL = int(os.environ.get("EVIDENCE_MAX_TOTAL_BYTES", 12_000_000))

# The repo is public and the evidence branch is permanent, so this is the only guard against
# publishing a credential. Matched on the file name, caption and criterion after "-" and "_" become spaces.
DENY = re.compile(
    r"pass(word|wd)|credential|secret|token|api ?key|cookie|session id|\botp\b|temporary"
    r"|logins? created|new login|reset login",
    re.I,
)
START = "<!-- ship:evidence:start -->"
END = "<!-- ship:evidence:end -->"


def norm(s):
    return re.sub(r"[-_]+", " ", str(s or ""))


def step_key(path):
    m = re.search(r"step-(\d+)", os.path.basename(path))
    return (int(m.group(1)) if m else 10**6, path)


def caption_from(name):
    s = re.sub(r"^step-\d+-?", "", os.path.splitext(name)[0]).replace("-", " ").replace("_", " ").strip()
    return s[:1].upper() + s[1:] if s else name


def select(e2e_path, run_dir, start):
    try:
        e2e = json.load(open(e2e_path))
    except (OSError, ValueError):
        return []
    run = os.path.realpath(run_dir) if run_dir else ""
    listed = {}
    for ev in e2e.get("evidence") or []:
        if isinstance(ev, dict) and str(ev.get("path", "")).endswith(".png"):
            listed[os.path.realpath(ev["path"])] = ev
    found = set()
    if run and os.path.isdir(run):
        for root, _, files in os.walk(run):
            found.update(os.path.realpath(os.path.join(root, f)) for f in files if re.match(r"step-.*\.png$", f))
    ordered = sorted(listed, key=step_key) + sorted(found - set(listed), key=step_key)

    kept, total = [], 0
    for p in ordered:
        name = os.path.basename(p)
        ev = listed.get(p, {})
        caption = str(ev.get("caption") or "") or caption_from(name)
        ac = str(ev.get("ac") or "")
        why = None
        if not (run and p.startswith(run + os.sep)):
            why = "not under this run's directory"
        elif not os.path.isfile(p):
            why = "missing"
        elif os.path.getmtime(p) < start:
            why = "older than the e2e attempt"
        elif ev.get("secret") is True or DENY.search(norm(name)) or DENY.search(norm(caption)) or DENY.search(norm(ac)):
            why = "may show a credential"
        elif os.path.getsize(p) == 0 or os.path.getsize(p) > MAX_FILE:
            why = "empty or over %d bytes" % MAX_FILE
        elif len(kept) >= MAX_COUNT or total + os.path.getsize(p) > MAX_TOTAL:
            why = "over the count or total size cap"
        if why:
            print("skipped %s: %s" % (name, why), file=sys.stderr)
            continue
        total += os.path.getsize(p)
        kept.append({"path": p, "name": name, "caption": caption, "ac": ac})
    return sorted(kept, key=lambda e: step_key(e["path"]))


def cell(t):
    return str(t or "").replace("\n", " ").replace('"', "'").strip()


def render(run, verdict, omitted, entries):
    lines = [START, "## Visual evidence", "", "Browser check (eduvault-e2e, run `%s`): **%s**" % (run, verdict), ""]
    for e in entries:
        ac = " (%s)" % cell(e["ac"]) if e.get("ac") else ""
        lines += ["**%s**%s" % (cell(e["caption"]), ac), "", '<img src="%s" width="480" alt="%s">' % (e["url"], cell(e["caption"])), ""]
    if omitted:
        lines += ["%d screenshot(s) left out: one may show a credential, or the cap was reached." % omitted, ""]
    lines.append(END)
    return "\n".join(lines)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "select" and len(sys.argv) == 5:
        print(json.dumps(select(sys.argv[2], sys.argv[3], float(sys.argv[4] or 0))))
    elif cmd == "render" and len(sys.argv) == 5:
        print(render(sys.argv[2], sys.argv[3], int(sys.argv[4]), json.load(sys.stdin)))
    else:
        sys.exit(__doc__)
