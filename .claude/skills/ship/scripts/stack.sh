#!/bin/bash
# The ticket's e2e stack: its worktree's own API, web-admin, web-portal and database, run by eduvault-e2e's
# stack-worktree.sh on the first free port triple (api 3710+n, admin 4720+2n, portal 4721+2n), so no run shares
# a port, a process or a database with another run or with the launcher's stack. This session owns it, never
# a subagent. What `up` applied is recorded in status.json .stack.
#
# usage: stack.sh up <KEY> [RUN_ID]    boot it and return; run it in the background right after implement so it
#                                      is warm by e2e. A running stack is adopted
#        stack.sh ready <KEY>          at e2e: start it if it is not up, restart it once if the branch gained a
#                                      migration since `up` or the API bundle is older than its source, wait
#                                      until the API and both SPAs answer, then eduvault-e2e's preflight (it
#                                      checks the API is Eduvault's); prints {api, admin, portal}
#        stack.sh down <KEY> [RUN_ID] [--force]
#                                      stop it, sweep any stack process of the worktree, drop its database
#                                      (already down is success); refused while the e2e run still has a browser
#                                      session open and no e2e.json
# exit:  0 ok   1 failed (output says why)   3 no free port triple   4 down refused: still in use
set -u
. "$(dirname "$0")/lib.sh"
export NX_DAEMON=false

CMD=${1:-} KEY=${2:-}
[ -n "$KEY" ] || { sed -n '2,17p' "$0"; exit 2; }
shift 2
FORCE=false; for a in "$@"; do [ "$a" = --force ] && FORCE=true; done
D=$(key_dir "$KEY") TREE=$(st_get "$KEY" '.worktree_path')
E2E=$ROOT/.claude/skills/eduvault-e2e/scripts
# A ticket that changes the e2e tooling must be tested with its own copy, not the launcher checkout's.
[ -d "$TREE/.claude/skills/eduvault-e2e/scripts" ] && E2E=$TREE/.claude/skills/eduvault-e2e/scripts
SW=$E2E/stack-worktree.sh
NAME=$(basename "${TREE:-none}")
STATE=$ROOT/var/e2e/stacks/$NAME/state.json
DIST=$TREE/apps/api/dist/main.cjs

alive_stack() { [ -f "$STATE" ] && kill -0 "$(jq -r .api_pid "$STATE")" 2>/dev/null; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1"; }
migs() { find "$TREE/apps/api/db/migrations" -maxdepth 1 -name '*.sql' 2>/dev/null | sed 's#.*/##' | sort | jq -R . | jq -sc .; }
url() { echo "http://localhost:$(jq -r ".$1" "$STATE")"; }

# The newest source edit the API bundle has not caught up with, or empty. Specs and docs never count.
stale() {
  [ -f "$DIST" ] || { echo "(no bundle)"; return; }
  find "$TREE/apps/api/src" "$TREE/libs/policy/src" "$TREE/libs/api-contract/src" "$TREE/libs/shared/src" \
    -type f -newer "$DIST" ! -name '*.spec.ts' ! -name '*.spec.tsx' ! -name '*.test.ts' ! -name '*.md' \
    -print -quit 2>/dev/null | sed "s#^$TREE/##"
}

record() {
  st_set "$KEY" '.stack = {up: true, name: $s.name, api_port: $s.api_port, admin_port: $s.admin_port,
      portal_port: $s.portal_port, database: $s.database, migrations_applied: $m, started_at: $t}' \
    --argjson s "$(cat "$STATE")" --argjson m "$(migs)" --arg t "$(now_iso)"
}

start() {
  [ -d "$TREE" ] || { echo "no worktree for $KEY"; return 1; }
  [ -d "$TREE/node_modules" ] || { echo "$TREE has no node_modules: the branch stage's pnpm install did not complete"; return 1; }
  if alive_stack; then echo "adopted running stack"; return 0; fi
  (cd "$ROOT" && pnpm db:up) >/dev/null 2>&1 || { echo "pnpm db:up failed"; return 1; }
  local out rc
  for _ in $(seq 1 15); do
    (cd "$ROOT" && docker compose exec -T postgres pg_isready -U eduvault) >/dev/null 2>&1 && break
    sleep 2
  done
  out=$(bash "$SW" up "$TREE" 2>&1); rc=$?
  printf '%s\n' "$out" | tail -6
  [ "$rc" -eq 3 ] && return 3
  [ "$rc" -eq 0 ] || return 1
  record
}

restart() {
  bash "$SW" down "$TREE" >/dev/null 2>&1
  start
}

healthy() {
  local _
  for _ in $(seq 1 10); do
    alive_stack && [ "$(code "$(url api_port)/health")" = 200 ] && [ "$(code "$(url admin_port)")" = 200 ] &&
      [ "$(code "$(url portal_port)")" = 200 ] && return 0
    sleep 3
  done
  return 1
}

# Why `down` would cut off the e2e run mid-flight, or empty. Only while its handoff is unwritten: a finished
# FAIL leaves its sessions open on purpose, for diagnosis.
busy() {
  local run sid started
  [ "$(st_get "$KEY" '.stages.e2e.result')" = running ] || return 0
  started=$(st_get "$KEY" '.stages.e2e.started_epoch'); started=${started:-0}
  [ -f "$D/e2e.json" ] && [ "$(mtime "$D/e2e.json")" -ge "$started" ] && return 0
  run=$(cat "$D/e2e.run" 2>/dev/null); sid=$(cat "$run/sid" 2>/dev/null)
  [ -n "$sid" ] || return 0
  (cd "$ROOT" && playwright-cli list 2>/dev/null) | grep -qE "\bev-[a-z]{2}-$sid\b" &&
    echo "browser session(s) ev-*-$sid of e2e run $run are open and e2e.json isn't written"
}

case "$CMD" in
  up)
    if alive_stack && [ -n "$(stale)" ]; then
      echo "running stack's API bundle is older than $(stale): restarting it"
      restart; exit $?
    fi
    start; exit $? ;;
  ready)
    if ! alive_stack; then start; rc=$?; [ "$rc" -eq 0 ] || exit "$rc"; fi
    RESTARTED=false
    if [ "$(migs)" != "$(st_get "$KEY" '.stack.migrations_applied' -c)" ]; then
      echo "the branch gained a migration since the stack came up: restarting it"
      restart; rc=$?; [ "$rc" -eq 0 ] || exit "$rc"; RESTARTED=true
    fi
    if [ -n "$(stale)" ] && ! $RESTARTED; then
      echo "API bundle is older than $(stale): rebuilding"
      restart; rc=$?; [ "$rc" -eq 0 ] || exit "$rc"; RESTARTED=true
    fi
    if ! healthy; then
      $RESTARTED || { echo "stack unhealthy: restarting it once"; restart; rc=$?; [ "$rc" -eq 0 ] || exit "$rc"; }
      healthy || { bash "$SW" status "$TREE"; echo "stack not answering"; exit 1; }
    fi
    PF=$(E2E_API_URL=$(url api_port) E2E_ADMIN_URL=$(url admin_port) E2E_PORTAL_URL=$(url portal_port) \
      E2E_STACK=$NAME bash "$E2E/preflight.sh" browser 2>&1) || { echo "$PF"; exit 1; }
    mkdir -p "$D"; echo "$PF" > "$D/preflight.txt"
    jq -nc --arg a "$(url api_port)" --arg d "$(url admin_port)" --arg p "$(url portal_port)" \
      '{api: $a, admin: $d, portal: $p}' ;;
  down)
    [ -n "$TREE" ] || { echo "no worktree recorded for $KEY: nothing to stop"; exit 0; }
    if ! $FORCE; then
      WHY=$(busy)
      [ -z "$WHY" ] || { echo "stack for $KEY is still in use: $WHY. Close it with bash $E2E/close-sessions.sh --run=<run dir>, or pass --force"; exit 4; }
    fi
    OUT=$(bash "$SW" down "$TREE" 2>&1) || { printf '%s\n' "$OUT" | tail -6; exit 1; }
    st_set "$KEY" 'if .stack then .stack.up = false else . end'
    echo "stack down" ;;
  *) sed -n '2,17p' "$0"; exit 2 ;;
esac
