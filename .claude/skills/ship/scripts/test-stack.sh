#!/bin/bash
# Offline test for stack.sh, the e2e checks in verify.sh and the e2e and pr prompts: no Docker, no network.
# stack-worktree.sh, preflight.sh, pnpm, docker, curl and playwright-cli are stand-ins inside a temp root.
# usage: bash .claude/skills/ship/scripts/test-stack.sh
set -u
W=$(cd "$(dirname "$0")" && pwd -P)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
unset HERDR_ENV
export SHIP_ROOT=$T SHIP_OPSX=$T/opsx
K=EDU-7 NAME=edu-7-demo
TREE=$T/wt/$NAME D=$T/opsx/$K SC=$T/.claude/skills/eduvault-e2e/scripts
mkdir -p "$SC" "$T/bin" "$TREE/node_modules" "$TREE/apps/api/db/migrations" "$TREE/apps/api/src" "$TREE/apps/api/dist" "$D"
touch "$TREE/apps/api/db/migrations/001_a.sql" "$TREE/apps/api/src/main.ts"
touch -t 202001010000 "$TREE/apps/api/src/main.ts"; touch "$TREE/apps/api/dist/main.cjs"
echo '{"stages":{}}' > "$D/status.json"
jq --arg t "$TREE" '.worktree_path = $t' "$D/status.json" > "$D/s.tmp" && mv "$D/s.tmp" "$D/status.json"

FAKE_PID=$$
cat > "$SC/stack-worktree.sh" <<EOF
#!/bin/bash
echo "\$1" >> "$T/calls.log"
STATE=$T/var/e2e/stacks/$NAME/state.json
case "\$1" in
  up) [ -n "\${FAKE_UP_RC:-}" ] && exit "\$FAKE_UP_RC"; mkdir -p "\$(dirname "\$STATE")"
      echo '{"name":"$NAME","database":"eduvault_e2e_x","api_port":3710,"admin_port":4720,"portal_port":4721,"api_pid":$FAKE_PID}' > "\$STATE"; echo "up" ;;
  down) rm -f "\$STATE"; echo down; exit "\${FAKE_DOWN_RC:-0}" ;;
  status) echo status ;;
esac
EOF
printf '#!/bin/bash\necho "e2e: env=local api=$E2E_API_URL admin=$E2E_ADMIN_URL portal=$E2E_PORTAL_URL stack=$E2E_STACK need=$1" >&2\necho ready\n' > "$SC/preflight.sh"
printf '#!/bin/sh\nexit 0\n' > "$T/bin/pnpm"; cp "$T/bin/pnpm" "$T/bin/docker"
printf '#!/bin/sh\nif [ -n "${FAKE_SESSIONS:-}" ]; then echo "$FAKE_SESSIONS"; fi\n' > "$T/bin/playwright-cli"
printf '#!/bin/sh\nprintf 200\n' > "$T/bin/curl"
chmod +x "$T/bin/"* "$SC/"*.sh
export PATH="$T/bin:$PATH"

FAIL=0
ok() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (want '$2', got '$3')"; FAIL=1; fi; }
rc() { "$@" >/dev/null 2>&1; echo $?; }
SS() { bash "$W/stack.sh" "$@"; }
get() { jq -r "$1" "$D/status.json"; }
calls() { local n; n=$(grep -c "^$1$" "$T/calls.log" 2>/dev/null); echo "${n:-0}"; }

echo "== stack.sh up"
ok "up exits 0" 0 "$(rc SS up $K run1)"
ok "up records the ports" "3710 4720 4721" "$(get '[.stack.api_port, .stack.admin_port, .stack.portal_port] | join(" ")')"
ok "up records the migrations" '["001_a.sql"]' "$(get '.stack.migrations_applied | tojson')"
ok "up marks the stack up" true "$(get .stack.up)"
touch "$TREE/apps/api/src/main.ts"
SS up $K >/dev/null 2>&1
ok "up on a running stack with a stale bundle restarts it" "1 2" "$(calls down) $(calls up)"
touch "$TREE/apps/api/dist/main.cjs"
ok "up on a running stack with a fresh bundle adopts it" 0 "$(rc SS up $K)"
ok "adopting did not start a second stack" 2 "$(calls up)"
SS down $K >/dev/null 2>&1
rm -f "$T/calls.log"
ok "no free port triple exits 3" 3 "$(FAKE_UP_RC=3 rc SS up $K)"
rmdir "$TREE/node_modules" && ok "no node_modules exits 1" 1 "$(rc SS up $K)"
mkdir "$TREE/node_modules"

echo "== stack.sh ready"
SS up $K >/dev/null 2>&1
OUT=$(SS ready $K); ok "ready exits 0 and prints the URLs" "http://localhost:3710 http://localhost:4720 http://localhost:4721" "$(jq -r '[.api, .admin, .portal] | join(" ")' <<<"$OUT")"
ok "ready wrote the preflight line naming the stack" 1 "$(grep -c "stack=$NAME" "$D/preflight.txt")"
rm -f "$T/calls.log"; touch -t 202601010000 "$TREE/apps/api/dist/main.cjs"; touch "$TREE/apps/api/src/main.ts"
SS ready $K >/dev/null 2>&1; ok "ready restarts once when the API source is newer than the bundle" "1 1" "$(calls down) $(calls up)"
touch "$TREE/apps/api/dist/main.cjs"; rm -f "$T/calls.log"
touch "$TREE/apps/api/db/migrations/002_b.sql"
SS ready $K >/dev/null 2>&1; ok "ready restarts when the branch gained a migration" "1 1" "$(calls down) $(calls up)"
ok "ready records both migrations" '["001_a.sql","002_b.sql"]' "$(get '.stack.migrations_applied | tojson')"
touch "$TREE/apps/api/src/main.spec.ts"; touch "$TREE/apps/api/dist/main.cjs"; touch "$TREE/apps/api/src/x.spec.ts"; rm -f "$T/calls.log"
SS ready $K >/dev/null 2>&1; ok "a newer spec file does not restart the stack" "0 0" "$(calls down) $(calls up)"

echo "== stack.sh down"
jq '.stages.e2e = {result: "running", started_epoch: 1}' "$D/status.json" > "$D/s.tmp" && mv "$D/s.tmp" "$D/status.json"
mkdir -p "$T/run" && echo abc123 > "$T/run/sid" && echo "$T/run" > "$D/e2e.run"
export FAKE_SESSIONS="- ev-ow-abc123: open"
ok "down refuses while the e2e browser session is open (exit 4)" 4 "$(rc SS down $K)"
ok "down --force overrides" 0 "$(rc SS down $K --force)"
SS up $K >/dev/null 2>&1
echo '{"verdict":"FAIL"}' > "$D/e2e.json"
ok "down proceeds once e2e.json is written" 0 "$(rc SS down $K)"
ok "down marks the stack down" false "$(get .stack.up)"
ok "down on an already-down stack is success" 0 "$(rc SS down $K)"
unset FAKE_SESSIONS
ok "a failing sweep (down fails) is exit 1" 1 "$(SS up $K >/dev/null 2>&1; FAKE_DOWN_RC=2 rc SS down $K)"

echo "== verify.sh e2e"
rm -f "$D/e2e.json"
jq '.stack = {api_port: 3710, admin_port: 4720, portal_port: 4721}' "$D/status.json" > "$D/s.tmp" && mv "$D/s.tmp" "$D/status.json"
report() { { echo "# $K e2e: PASS"; for i in $(seq 1 15); do echo "line $i"; done; echo "$1"; } > "$D/report.md"; }
verdict() { jq -nc --arg r "$D/report.md" --argjson p "$1" '{verdict: "PASS", report: $r, partial: $p, evidence: []}' > "$D/e2e.json"; }
GOOD='e2e: env=local api=http://localhost:3710 admin=http://localhost:4720 portal=http://localhost:4721 stack=edu-7-demo need=browser'
report "$GOOD"; verdict '[]'
ok "PASS quoting the stack's ports verifies" 0 "$(rc bash "$W/verify.sh" $K e2e)"
report 'e2e: env=local api=http://localhost:3000 admin=http://localhost:4200 portal=http://localhost:4201 stack=shared need=browser'
ok "PASS that ran on another stack is refused" 2 "$(rc bash "$W/verify.sh" $K e2e)"
report 'no preflight line here'
ok "PASS without the preflight line is refused" 2 "$(rc bash "$W/verify.sh" $K e2e)"
report "$GOOD"; verdict '[{"path":"isolation case 5","reason":"no persona"}]'
ok "PASS omitting a partial entry is refused" 2 "$(rc bash "$W/verify.sh" $K e2e)"
report "$GOOD
not exercised locally: isolation case 5"
ok "PASS naming the partial entry verifies" 0 "$(rc bash "$W/verify.sh" $K e2e)"
jq 'del(.stack)' "$D/status.json" > "$D/s.tmp" && mv "$D/s.tmp" "$D/status.json"; report 'no preflight line here'; verdict '[]'
ok "without a recorded stack the URL check is skipped" 0 "$(rc bash "$W/verify.sh" $K e2e)"

echo "== prompt.sh e2e and pr"
ok "e2e prompt needs the three URLs" 2 "$(rc bash "$W/prompt.sh" $K e2e)"
bash "$W/prompt.sh" $K e2e API=http://localhost:3710 ADMIN=http://localhost:4720 PORTAL=http://localhost:4721 >/dev/null
P=$(cat "$D/prompt.e2e.txt")
ok "e2e prompt names the worktree ports" 1 "$(grep -c 'api http://localhost:3710, web-admin http://localhost:4720, web-portal http://localhost:4721' <<<"$P")"
ok "e2e prompt has no api mode left" 0 "$(grep -c 'mode "api"' <<<"$P")"
ok "e2e prompt forbids seeding" 1 "$(grep -c 'Never run db:seed' <<<"$P")"
jq '.branch = "edu-7-demo"' "$D/status.json" > "$D/s.tmp" && mv "$D/s.tmp" "$D/status.json"
jq -nc '{verdict: "PASS", report: "r", partial: [{path: "isolation case 5", reason: "no persona"}]}' > "$D/e2e.json"
echo '{"result":"pass","unrun_specs":["api:test-integration (Docker)"]}' > "$D/push.json"
bash "$W/prompt.sh" $K pr >/dev/null; P=$(cat "$D/prompt.pr.txt")
ok "pr prompt lists the e2e partial entry" 1 "$(grep -c -- '- isolation case 5: no persona' <<<"$P")"
ok "pr prompt lists the unrun spec" 1 "$(grep -c -- '- api:test-integration (Docker) (not run locally)' <<<"$P")"
ok "pr prompt does not claim a full browser verification with partial coverage" 0 "$(grep -c 'verified in the browser by' <<<"$P")"
jq -nc '{verdict: "PASS", report: "r", partial: []}' > "$D/e2e.json"; echo '{"result":"pass"}' > "$D/push.json"
bash "$W/prompt.sh" $K pr >/dev/null; P=$(cat "$D/prompt.pr.txt")
ok "pr prompt says verified when PASS and nothing partial" 1 "$(grep -c "verified in the browser by /ship's e2e stage (PASS)" <<<"$P")"
ok "pr prompt says nothing is left unverified" 1 "$(grep -c 'Nothing: every check ran locally.' <<<"$P")"
echo '{"verdict":"BLOCKED","report":"r"}' > "$D/e2e.json"
bash "$W/prompt.sh" $K pr >/dev/null
ok "pr prompt claims no browser verification on a non-PASS verdict" 0 "$(grep -c 'verified in the browser by' "$D/prompt.pr.txt")"

[ "$FAIL" = 0 ] && echo "all passed" || { echo "FAILED"; exit 1; }
