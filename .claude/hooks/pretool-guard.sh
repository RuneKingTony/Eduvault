#!/bin/bash
# PreToolUse guard (matcher: Bash). Denies, naming the alternative:
#   nohup, disown or a background & (outside quotes and heredoc bodies)
#   git hook bypasses: commit --no-verify / -n, push|merge --no-verify, HUSKY=0, core.hooksPath
# Anything else, or input it can't parse: no output, exit 0 (allow).
set -u

IN=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$IN" 2>/dev/null) || exit 0

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

case "$TOOL" in
Bash)
  CMD=$(jq -r '.tool_input.command // empty' <<<"$IN" 2>/dev/null)
  grep -qE '&|nohup|disown|no-verify|commit|HUSKY|hooksPath' <<<"$CMD" || exit 0
  WHY=$(python3 -c '
import re, sys
s = sys.argv[1]

def drop_heredocs(s):
    out, lines, i = [], s.split("\n"), 0
    while i < len(lines):
        line = lines[i]; out.append(line); i += 1
        for dash, _, tag in re.findall(r"<<(-?)\s*([\x27\"]?)(\w+)\2", line):
            while i < len(lines) and (lines[i].strip() if dash else lines[i]) != tag:
                i += 1
            i += 1
    return "\n".join(out)

def drop_quotes(s):
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            i += 2; continue
        if c == "\x27":
            j = s.find("\x27", i + 1); i = n if j < 0 else j + 1; out.append("\x27\x27"); continue
        if c == "\"":
            i += 1
            while i < n and s[i] != "\"":
                i += 2 if s[i] == "\\" else 1
            i += 1; out.append("\x27\x27"); continue
        if c == "#" and (not out or out[-1] in " \t\n;|&("):
            while i < n and s[i] != "\n":
                i += 1
            continue
        out.append(c); i += 1
    return "".join(out)

s = drop_quotes(drop_heredocs(s))
if re.search(r"(^|[;&|(`\n])\s*(\w+=\S*\s+)*(nohup|disown)(\s|;|$)", s):
    print("bg")
elif "&" in re.sub(r"&&|\|&|[<>]&|&>", "", s):
    print("bg")
elif re.search(r"(^|[\s;&|(])HUSKY(_SKIP_HOOKS)?=|core\.hooksPath", s):
    print("verify")
else:
    for seg in re.split(r"&&|\|\||[;|\n]", s):
        m = re.search(r"\bgit\b.*?\b(commit|push|merge)\b(.*)", seg)
        if not m:
            continue
        toks = m.group(2).split()
        if "--no-verify" in toks or (m.group(1) == "commit" and any(re.fullmatch(r"-[a-zA-Z]*n[a-zA-Z]*", t) for t in toks)):
            print("verify"); break
' "$CMD" 2>/dev/null)
  case "$WHY" in
    bg) deny "No nohup, disown or background &: run it with the Bash tool's run_in_background: true and end your turn — the harness wakes you when it exits." ;;
    verify) deny "Never bypass git hooks (--no-verify, -n, HUSKY=0, core.hooksPath): fix what the hook reports, then commit or push normally." ;;
  esac ;;
esac
exit 0
