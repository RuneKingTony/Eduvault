#!/bin/bash
# Render a stage prompt from prompts/<stage>.txt into $D/prompt.<stage>.txt and print its path.
# The orchestrator never writes prompts itself (output tokens, and wording drift between runs).
# Subagent stages (branch, security, e2e, propose) get a one-line Agent prompt instead:
#   "Read and follow <this file>."
#
# usage: prompt.sh <KEY> <stage> [NAME=value ...]    e.g. prompt.sh EDU-1 branch RUN_ID=<id>
# {{RULES}} is the shared worker rules inline; {{RULES_FILE}} their copy in $D/worker-rules.md, for the
# one-line /goal prompts.
set -u
. "$(dirname "$0")/lib.sh"

KEY=$1 STAGE=$2; shift 2
D=$(key_dir "$KEY") T=$W/prompts/$STAGE.txt OUT=$D/prompt.$STAGE.txt
[ -f "$T" ] || { echo "no template $T" >&2; exit 2; }
SEC=""; [ -f "$D/security.md" ] && SEC=" and $D/security.md"
read -r _ TESTED_TREE TESTED_STAGE _ 2>/dev/null < "$D/tested.pass"
if [ -n "${TESTED_TREE:-}" ]; then
  TESTED="$TESTED_STAGE ran typecheck, lint and unit tests and passed on tree $TESTED_TREE. If git status --porcelain prints nothing and git rev-parse 'HEAD^{tree}' prints exactly that tree, skip the checks except pnpm format:check: it was verified on this exact tree. Otherwise run"
else TESTED="no tested tree is recorded, so run"; fi
E2E_REASON=$(st_get "$KEY" 'select(.stages.e2e.result == "skipped") | .stages.e2e.reason // "no reason recorded"')
if [ -n "$E2E_REASON" ]; then E2E_NOTE="e2e skipped: $E2E_REASON"
elif [ "$(jq -r '.mode // empty' "$D/e2e-gate.json" 2>/dev/null)" = api ]; then E2E_NOTE="verified via API calls (no browser surface)"
else E2E_NOTE="verified in the browser by /ship's e2e stage"; fi
mkdir -p "$D"; RULES_FILE=$D/worker-rules.md
cat > "$RULES_FILE" <<RULES_EOF
Rules:
- Base, in the worktree: run git fetch -q origin main (a failure is fine), then B=\$(git merge-base HEAD origin/main). Diff with git diff \$B plus untracked files, never against local main, which is stale. Scope tests with nx affected --base=origin/main or pnpm validate:quick; never run the full suite.
- Foreground only: never run_in_background, &, nohup, ScheduleWakeup, Monitor or /loop, and never end your turn before your JSON handoff is written.
- Never bypass git hooks (--no-verify, HUSKY=0). Never cat, grep or print .env files or secrets; test for a key with grep -q.
- Never close or edit the GitHub issue, never merge, never mark a PR ready. EDU_ORCHESTRATED=1 is set; gh-issues.sh close-issue refuses.
- Comments: follow $ROOT/CLAUDE.md "Comment hygiene": none unless it explains something critical a reader can't work out from the code, one or two lines; never restate the code, narrate the change or name the ticket.
- Never hand-edit apps/api/db/schema.sql, apps/api/src/db/db-types.ts or apps/api/db/auth-schema.snapshot.sql; run pnpm drift:fix. If the schema or Better Auth options changed, pnpm drift must be green.
- Handoffs: write every JSON handoff, and every tasks.md checkbox, with the Write or Edit tool at the absolute path given under $D, never by shell redirection, tee, sed -i or jq > into it, and never under ~/.claude.
- Tests: unit specs run with nx run <project>:test (Docker-free). NX_DAEMON=false and NX_ISOLATE_PLUGINS=false are already exported. A spec that needs Docker/testcontainers (api:test-integration, pnpm drift) or a localhost port can't run here: never fake a pass or skip silently, list it as "unrun_specs": ["<path or target>", ...] in your JSON handoff (implement: $D/implement.json) and keep "result": "pass" if that is the only gap; the orchestrator runs them.
- Shell is zsh: quote globs ('*.ts'), never echo ==, no timeout command (macOS has none), no foreground sleep.
RULES_EOF

python3 - "$T" "$OUT" "$@" <<PY
import sys
t, out, *kv = sys.argv[1:]
v = {"KEY": "$KEY", "D": "$D", "W": "$W", "ROOT": "$ROOT", "BRANCH": """$(st_get "$KEY" '.branch')""",
     "WORKTREE": """$(st_get "$KEY" '.worktree_path')""", "GOAL_LINE": """$(st_get "$KEY" '.goal_line')""",
     "SECURITY_MD": "$SEC", "TESTED": """$TESTED""", "E2E_NOTE": """$E2E_NOTE""", "RUN_ID": "${RUN_ID:-}",
     "NUM": "$(issue_num "$KEY")", "RULES": open("$RULES_FILE").read().strip(), "RULES_FILE": "$RULES_FILE"}
v.update(x.split("=", 1) for x in kv)
s = open(t).read()
for k, val in v.items():
    s = s.replace("{{" + k + "}}", val)
if "{{" in s:
    sys.exit("unfilled placeholder in " + t + ": " + s[s.index("{{"):s.index("}}") + 2])
open(out, "w").write(s)
PY
[ $? -eq 0 ] || exit 2
echo "$OUT"
