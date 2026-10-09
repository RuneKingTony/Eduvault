#!/bin/bash
# Record the sticky flags in the epic's status.json and print the effective config. A flag
# passed again overrides its stored value; an omitted one keeps it (a resume never widens --only).
# `--only +K,K` appends to the stored list instead (widening a run mid-flight); on a run without
# --only (the whole epic) it is a no-op.
#
# Every real invocation also stamps .run_started: the epic's .spike-lock acquired_epoch (so a re-run
# of init.sh inside the same /spike, e.g. `--only +K`, keeps the run's budget), else now.
# --max-tickets counts only dispatches since then. And it marks the cached graph stale, so the
# next graph.sh refetches from GitHub.
#
# usage: init.sh <EPIC> [--concurrency N (cap 10)] [--only K,K|N-M|+K,K] [--max-tickets N] [--auto-decide] [--dry-run|--status]
#   --dry-run: write the merged config to <epic dir>/dry-status.json instead, never status.json
#   --status:  write nothing, just print the stored config
#   prints {concurrency, cap, only, max_tickets, budget_left, auto_decide, ship_max_parallel, started,
#           run_started, dry_run}; ship_max_parallel is the cap every ticket pane's ship runs with
#           (dispatch.sh exports SHIP_MAX_PARALLEL=<cap>), so it always equals cap
set -u
. "$(dirname "$0")/lib.sh"

EPIC=$(norm_epic "${1:-}") || exit 2; shift
F='.'; A=(); DRY=false STATUS=false
while [ $# -gt 0 ]; do
  case "$1" in
    --concurrency)
      [[ "${2:-}" =~ ^[0-9]+$ ]] && [ "$2" -ge 1 ] || { echo "--concurrency needs a whole number >= 1"; exit 2; }
      F+=' | .concurrency = ($c | tonumber)'; A+=(--arg c "$2"); shift ;;
    --only)
      OL=$(node "$SP/only.mjs" "${2:-}") || exit 2
      A+=(--argjson ol "$(jq -c .keys <<<"$OL")")
      if [ "$(jq -r .append <<<"$OL")" = true ]; then
        F+=' | .only = (if .only then (.only + $ol | reduce .[] as $x ([]; if index([$x]) then . else . + [$x] end)) else .only end)'
      else F+=' | .only = $ol'; fi
      shift ;;
    --max-tickets)
      [[ "${2:-}" =~ ^[0-9]+$ ]] && [ "$2" -ge 1 ] || { echo "--max-tickets needs a whole number >= 1"; exit 2; }
      F+=' | .max_tickets = ($m | tonumber)'; A+=(--arg m "$2"); shift ;;
    --auto-decide) F+=' | .auto_decide = true' ;;
    --dry-run) DRY=true ;;
    --status) STATUS=true ;;
    *) echo "unknown flag $1"; exit 2 ;;
  esac; shift
done
F+=' | .concurrency //= 3 | .started //= $now | .epic = $e | .run_started = $rs'
D=$(epic_dir "$EPIC"); mkdir -p "$D"
SRC=$D/status.json; [ -f "$SRC" ] || { SRC=$D/.empty.json; echo '{"dispatched":{}}' > "$SRC"; }
OUT=$D/status.json; $DRY && OUT=$D/dry-status.json
if $STATUS; then
  OUT=$SRC
else
  RS=$($DRY || jq -r '.acquired_epoch // empty' "$D/.spike-lock" 2>/dev/null); RS=${RS:-$(date +%s)}
  jq "${A[@]}" --arg now "$(now_iso)" --arg e "$EPIC" --argjson rs "$RS" "$F" "$SRC" > "$OUT.tmp.$$" &&
    mv "$OUT.tmp.$$" "$OUT" || exit 1
  # links edited minutes before this run must be seen: age the cache past any --max-age
  $DRY || { [ -f "$D/graph.json" ] && touch -t 200001010000 "$D/graph.json"; }
fi
jq -c --arg d "$DRY" '
  ([(.concurrency // 3), 10] | min) as $cap | (.run_started // 0) as $rs
  | ([.dispatched // {} | .[] | select((.epoch // 0) >= $rs)] | length) as $used
  | {concurrency, cap: $cap, only, max_tickets,
     budget_left: (if .max_tickets then ([.max_tickets - $used, 0] | max) else null end),
     auto_decide: (.auto_decide // false), ship_max_parallel: $cap, started, run_started,
     dry_run: ($d == "true")}' "$OUT"
rm -f "$D/.empty.json"
