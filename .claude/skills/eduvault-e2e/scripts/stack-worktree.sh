#!/usr/bin/env bash
# stack-worktree.sh — run a worktree's API + web-admin + web-portal beside the shared stack, so e2e runs
# on different branches (or the same one) never share a process or a database.
#
#   stack-worktree.sh up <worktree> [--api-port=N --admin-port=N --portal-port=N]
#   stack-worktree.sh env <worktree>      # prints exports; eval "$(stack-worktree.sh env X)"
#   stack-worktree.sh status [<worktree>]
#   stack-worktree.sh down <worktree>     # stops what `up` started, sweeps any stack process of this worktree
#                                         # that state.json lost, fails if one survives, drops its database
# exit: 0 ok   2 failed (message says why)   3 no free port triple
#
# <worktree> is a name under .claude/worktrees/ or a path. Ports default to the first free triple
# api 3700+n, admin 4700+2n, portal 4701+2n (n = 10, 11, ...), so :3000/:4200/:4201 and a launcher's
# :3700/:4700 are never touched.
#
# Own database: the shared Postgres container (host :5434) gets a database eduvault_e2e_<name>; `up`
# applies the worktree's migrations to it with dbmate. Nothing is copied: the personas are provisioned
# through the API, so the shared `eduvault` database is never read or written.
# Browser note: session cookies are host-scoped, so two stacks on localhost share cookies inside ONE
# browser. Concurrent runs are safe because each opens its own playwright-cli session (see close-sessions.sh).
set -uo pipefail
# vite configs load @nx/vite plugins; a dying nx daemon took the dev server down with it.
export NX_DAEMON=false
. "$(dirname "${BASH_SOURCE[0]}")/stack-sweep.sh"
COMMON="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --path-format=absolute --git-common-dir)"
REPO_ROOT="$(cd "$COMMON/.." && pwd -P)"
STACKS="$REPO_ROOT/var/e2e/stacks"
SECRET='local-dev-secret-change-me-at-least-32-chars'
die() { echo "stack-worktree.sh: $*" >&2; exit 2; }

cmd="${1:-}"; shift || true
TARGET=""; API_PORT=""; ADMIN_PORT=""; PORTAL_PORT=""
for arg in "$@"; do
  case "$arg" in
    --api-port=*) API_PORT="${arg#*=}" ;;
    --admin-port=*) ADMIN_PORT="${arg#*=}" ;;
    --portal-port=*) PORTAL_PORT="${arg#*=}" ;;
    -*) die "unknown flag $arg" ;;
    *) TARGET="$arg" ;;
  esac
done
[[ "$cmd" =~ ^(up|down|env|status)$ ]] || { sed -n '2,19p' "$0"; exit 2; }

port_free() { ! lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }
alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }
kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill "$1" 2>/dev/null; }
port_owner() { lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1" pid "$2}'; }
stack_pids() { ps -axo pid=,command= | sweep_match "$TREE"; }
sweep() { local p; for p in $(stack_pids); do kill_tree "$p"; done; sleep 1; for p in $(stack_pids); do kill -9 "$p" 2>/dev/null; done; }
sget() { jq -r --arg k "$2" '.[$k] // empty' "$1" 2>/dev/null; }
psql_admin() { (cd "$REPO_ROOT" && docker compose exec -T postgres psql -U eduvault -d postgres -v ON_ERROR_STOP=1 -Atqc "$1"); }

if [[ "$cmd" == status && -z "$TARGET" ]]; then
  found=false
  for s in "$STACKS"/*/state.json; do
    [[ -f "$s" ]] || continue; found=true
    a="$(sget "$s" api_port)"; h=down; curl -fsS -m 2 -o /dev/null "http://localhost:$a/health" 2>/dev/null && h=up
    echo "$(sget "$s" name)  api :$a  admin :$(sget "$s" admin_port)  portal :$(sget "$s" portal_port)  $h  ($(sget "$s" tree))"
  done
  $found || echo "no worktree stacks"; exit 0
fi

[[ -n "$TARGET" ]] || die "name a worktree (a directory under .claude/worktrees/, or a path)"
if [[ -d "$TARGET" ]]; then TREE="$(cd "$TARGET" && pwd -P)"
elif [[ -d "$REPO_ROOT/.claude/worktrees/$TARGET" ]]; then TREE="$(cd "$REPO_ROOT/.claude/worktrees/$TARGET" && pwd -P)"
elif [[ "$cmd" != up && -f "$STACKS/$(basename "$TARGET")/state.json" ]]; then TREE="$REPO_ROOT/.claude/worktrees/$(basename "$TARGET")"
elif [[ "$cmd" == down ]]; then TREE="$REPO_ROOT/.claude/worktrees/$(basename "$TARGET")"
else die "no worktree '$TARGET' (looked for a path, and .claude/worktrees/$TARGET)"; fi
NAME="$(basename "$TREE")"
SAFE="$(echo "$NAME" | tr -c 'a-zA-Z0-9\n' '_' | tr 'A-Z' 'a-z')"
DB="eduvault_e2e_$SAFE"
DIR="$STACKS/$NAME"; STATE="$DIR/state.json"

case "$cmd" in
env)
  [[ -f "$STATE" ]] || die "no stack for $NAME — stack-worktree.sh up $NAME"
  echo "export E2E_API_URL=http://localhost:$(sget "$STATE" api_port)"
  echo "export E2E_ADMIN_URL=http://localhost:$(sget "$STATE" admin_port)"
  echo "export E2E_PORTAL_URL=http://localhost:$(sget "$STATE" portal_port)"
  echo "export E2E_STACK=$NAME"
  exit 0 ;;
status)
  [[ -f "$STATE" ]] || { echo "$NAME: not started"; exit 1; }
  for k in api_pid admin_pid portal_pid; do p="$(sget "$STATE" "$k")"; alive "$p" && echo "$k $p running" || echo "$k ${p:-?} DEAD"; done
  curl -fsS -m 2 -o /dev/null "http://localhost:$(sget "$STATE" api_port)/health" && echo "api healthy" || echo "api not answering"
  echo "db $DB"; exit 0 ;;
down)
  if [[ -f "$STATE" ]]; then
    for k in portal_pid admin_pid api_pid; do p="$(sget "$STATE" "$k")"; alive "$p" && { kill_tree "$p"; echo "stopped $k ($p)"; }; done
    sleep 1
    for k in portal_pid admin_pid api_pid; do p="$(sget "$STATE" "$k")"; alive "$p" && { kill -9 "$p" 2>/dev/null; echo "killed $k ($p)"; }; done
  fi
  sweep
  left="$(stack_pids | tr '\n' ' ')"
  [[ -z "${left// }" ]] || die "$NAME: still running after down: pids $left"
  psql_admin "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null 2>&1 || echo "warning: could not drop $DB; down retries it"
  rm -f "$STATE"; echo "$NAME down (logs kept in $DIR)"; exit 0 ;;
esac

# ---- up
if [[ -f "$STATE" ]] && alive "$(sget "$STATE" api_pid)"; then echo "$NAME already up — eval \"\$(bash $0 env $NAME)\""; exit 0; fi
sweep
[[ -d "$TREE/node_modules" ]] || die "$TREE has no node_modules — run pnpm install there first"
psql_admin 'select 1' >/dev/null 2>&1 || die "Postgres is not reachable: run pnpm db:up in the main checkout"

if [[ -z "$API_PORT" ]]; then
  for n in $(seq 10 90); do
    a=$((3700 + n)); d=$((4700 + 2 * n)); p=$((4701 + 2 * n))
    if port_free "$a" && port_free "$d" && port_free "$p"; then API_PORT=$a; ADMIN_PORT=$d; PORTAL_PORT=$p; break; fi
  done
  [[ -n "$API_PORT" ]] || { echo "stack-worktree.sh: no free port triple found" >&2; exit 3; }
fi
for p in "$API_PORT" "$ADMIN_PORT" "$PORTAL_PORT"; do port_free "$p" || die "port $p is taken by $(port_owner "$p")"; done

psql_admin "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null && psql_admin "CREATE DATABASE \"$DB\"" >/dev/null || die "cannot create $DB"
DB_URL="postgres://eduvault:eduvault@localhost:5434/$DB?sslmode=disable"
drop_db() { psql_admin "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null 2>&1; }
(cd "$TREE/apps/api" && DATABASE_URL="$DB_URL" pnpm exec dbmate --migrations-dir db/migrations --no-dump-schema up) >/dev/null || { drop_db; die "migrations failed"; }

mkdir -p "$DIR"; : >"$DIR/api.log"; : >"$DIR/admin.log"; : >"$DIR/portal.log"
(cd "$TREE/apps/api" && pnpm exec vite build >"$DIR/api-build.log" 2>&1) && [[ -f "$TREE/apps/api/dist/main.cjs" ]] || { tail -15 "$DIR/api-build.log" >&2; drop_db; die "API build failed"; }

ADMIN_URL="http://localhost:$ADMIN_PORT"; PORTAL_URL="http://localhost:$PORTAL_PORT"
(cd "$TREE/apps/api" && exec env NODE_ENV=development PORT="$API_PORT" DATABASE_URL="$DB_URL" BETTER_AUTH_SECRET="$SECRET" E2E_TRUST_INVITEES=true \
   BETTER_AUTH_URL="http://localhost:$API_PORT" WEB_ADMIN_URL="$ADMIN_URL" WEB_PORTAL_URL="$PORTAL_URL" \
   node --enable-source-maps "$TREE/apps/api/dist/main.cjs") >"$DIR/api.log" 2>&1 &
API_PID=$!
for app in admin portal; do
  port=$ADMIN_PORT; [[ $app == portal ]] && port=$PORTAL_PORT
  (cd "$TREE/apps/web-$app" && exec env VITE_API_URL="http://localhost:$API_PORT" pnpm exec vite --port "$port" --strictPort --host localhost) >"$DIR/$app.log" 2>&1 &
  eval "${app^^}_PID=$!"
done
jq -n --arg n "$NAME" --arg t "$TREE" --arg db "$DB" --argjson ap "$API_PORT" --argjson dp "$ADMIN_PORT" --argjson pp "$PORTAL_PORT" \
  --argjson a "$API_PID" --argjson d "$ADMIN_PID" --argjson p "$PORTAL_PID" \
  '{name:$n,tree:$t,database:$db,api_port:$ap,admin_port:$dp,portal_port:$pp,api_pid:$a,admin_pid:$d,portal_pid:$p}' >"$STATE"

echo -n "waiting for :$API_PORT :$ADMIN_PORT :$PORTAL_PORT"
ok=false
for _ in $(seq 1 60); do
  if curl -fsS -m 2 -o /dev/null "http://localhost:$API_PORT/health" 2>/dev/null && curl -fsS -m 2 -o /dev/null "$ADMIN_URL" 2>/dev/null && curl -fsS -m 2 -o /dev/null "$PORTAL_URL" 2>/dev/null; then ok=true; break; fi
  alive "$API_PID" || break
  echo -n .; sleep 2
done
echo
if ! $ok; then tail -15 "$DIR/api.log" >&2; bash "$0" down "$NAME" >/dev/null; die "stack did not come up (logs in $DIR)"; fi
echo "$NAME up: api http://localhost:$API_PORT · admin $ADMIN_URL · portal $PORTAL_URL · db $DB"
echo "point eduvault-e2e at it:  eval \"\$(bash $0 env $NAME)\""
