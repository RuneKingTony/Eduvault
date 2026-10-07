#!/bin/bash
# The local stack for the e2e stage: the one shared eduvault Postgres on :5434 plus `pnpm dev`
# (api :3000, web-admin :4200, web-portal :4201), run from the ticket's worktree. The ports are
# fixed, so only one ticket's stack runs at a time: `up` holds the `e2e-stack` mutex until `down`.
# See .claude/skills/run-local/SKILL.md for the recipe this follows.
#
# usage: stack.sh up <KEY> <run_id>   foreground; run it in the background. Takes the mutex, runs
#                                     `pnpm db:up`, then `pnpm dev` in the worktree until killed
#        stack.sh ready <KEY>         wait until /health and both SPAs answer; prints {api, admin, portal}
#        stack.sh down <KEY> <run_id> kill the pnpm dev this script started, release the mutex; never db-stop
# exit:  0 ok   1 failed (output says why)   30 mutex timeout
set -u
. "$(dirname "$0")/lib.sh"
export NX_DAEMON=false

CMD=${1:-} KEY=${2:-} RUN_ID=${3:-}
[ -n "$KEY" ] || { sed -n '2,13p' "$0"; exit 2; }
D=$(key_dir "$KEY") TREE=$(st_get "$KEY" '.worktree_path')
PIDF=$D/stack.pid
listening() { lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1"; }

case "$CMD" in
up)
  [ -d "$TREE" ] || { echo "no worktree for $KEY"; exit 1; }
  bash "$W/mutex.sh" acquire e2e-stack "$KEY" "$RUN_ID" 3600 30 || exit 30
  if listening 3000; then
    echo "port 3000 is already in use by something that is not this run: refusing to start a second stack"
    bash "$W/mutex.sh" release e2e-stack "$KEY" "$RUN_ID"; exit 1
  fi
  (cd "$TREE" && pnpm db:up) || { echo "pnpm db:up failed"; bash "$W/mutex.sh" release e2e-stack "$KEY" "$RUN_ID"; exit 1; }
  st_set "$KEY" '.stack = {up: true, database: "eduvault:5434", migrations_applied: [], started_at: $t}' --arg t "$(now_iso)"
  echo $$ > "$PIDF"
  cd "$TREE" && exec pnpm dev ;;
ready)
  for _ in $(seq 1 60); do
    [ "$(code http://localhost:3000/health)" = 200 ] && [ "$(code http://localhost:4200)" = 200 ] && [ "$(code http://localhost:4201)" = 200 ] && {
      A=$(ls "$TREE/apps/api/db/migrations" 2>/dev/null | grep '\.sql$' | jq -R . | jq -sc .)
      st_set "$KEY" '.stack.migrations_applied = $m' --argjson m "$A"
      echo '{"api":"http://localhost:3000","admin":"http://localhost:4200","portal":"http://localhost:4201"}'; exit 0; }
    sleep 3
  done
  echo "stack not answering on :3000 /health, :4200, :4201"; exit 1 ;;
down)
  P=$(cat "$PIDF" 2>/dev/null)
  if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then
    pkill -TERM -P "$P" 2>/dev/null; kill -TERM "$P" 2>/dev/null
  fi
  rm -f "$PIDF"
  st_set "$KEY" 'if .stack then .stack.up = false else . end'
  bash "$W/mutex.sh" release e2e-stack "$KEY" "${RUN_ID:-}"
  echo "stack down" ;;
*) sed -n '2,13p' "$0"; exit 2 ;;
esac
