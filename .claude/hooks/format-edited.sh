#!/usr/bin/env bash
# PostToolUse: keep every file Claude edits prettier-clean.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
file=$(node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    try { console.log(JSON.parse(raw).tool_input?.file_path ?? ""); } catch { console.log(""); }
  });
')
[ -n "$file" ] && [ -f "$file" ] || exit 0
pnpm exec prettier --write --ignore-unknown --log-level=silent "$file" || true
