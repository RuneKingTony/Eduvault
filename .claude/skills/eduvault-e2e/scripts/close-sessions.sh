#!/usr/bin/env bash
# close-sessions.sh — close the playwright-cli sessions an e2e run opened, by name.
#
#   close-sessions.sh --run=<run dir>   ev-*-<sid> sessions of that run (the pass-path teardown)
#   close-sessions.sh --stale           ev-* sessions whose run directory was not touched in 24h
#   close-sessions.sh <name>...         exactly these
#   [--dry-run]
#
# Session names are ev-<persona code>-<sid> (see session-name.sh). Never `close-all` / `kill-all`: both
# act on every browser on the machine, including another run's. Sessions without the ev- prefix are never touched.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
RUN="" STALE=false DRY=false NAMES=()
for arg in "$@"; do
  case "$arg" in
    --run=*) RUN="${arg#--run=}" ;;
    --stale) STALE=true ;;
    --dry-run) DRY=true ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    -*) echo "close-sessions.sh: unknown flag $arg" >&2; exit 2 ;;
    *) NAMES+=("$arg") ;;
  esac
done
open_sessions() { playwright-cli list 2>/dev/null | grep -oE '\bev-[a-z]{2}-[a-z0-9]{6}\b' | sort -u; }

targets=()
if [[ ${#NAMES[@]} -gt 0 ]]; then targets=("${NAMES[@]}")
elif [[ -n "$RUN" ]]; then
  sid="$(cat "$RUN/sid" 2>/dev/null)" || { echo "close-sessions.sh: no sid file in $RUN" >&2; exit 2; }
  while read -r s; do [[ -n "$s" && "$s" == *"-$sid" ]] && targets+=("$s"); done < <(open_sessions)
elif $STALE; then
  while read -r s; do
    [[ -n "$s" ]] || continue
    live="$(find "$ROOT/tmp/e2e" -mindepth 2 -maxdepth 2 -name sid -mtime -1 2>/dev/null | while read -r f; do [[ "$(cat "$f")" == "${s##*-}" ]] && echo "$f"; done | head -1)"
    [[ -z "$live" ]] && targets+=("$s")
  done < <(open_sessions)
else echo "close-sessions.sh: pass --run=<run dir>, --stale or session names" >&2; exit 2; fi

for s in "${targets[@]+"${targets[@]}"}"; do
  if $DRY; then echo "would close $s"; else playwright-cli -s="$s" close >/dev/null 2>&1; echo "closed $s"; fi
done
[[ ${#targets[@]} -eq 0 ]] && echo "nothing to close"
exit 0
