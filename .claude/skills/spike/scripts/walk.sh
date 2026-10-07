#!/bin/bash
# One DAG walk: observe every ticket, compute the next dispatch set, and (unless --status) render
# progress.md. Uses the cached graph.json — refresh it with graph.sh first when GitHub may have moved.
#
# usage: walk.sh <EPIC> [--status|--dry-run|--refresh]
#   (none)     prints the dag.mjs `next` JSON line plus `auto_resume`: died tickets to re-dispatch now with
#              `dispatch.sh <EPIC> <KEY> --auto-resume`, once per run, cut to the free slots (and `dispatch`
#              cut by as many). Renders progress.md, retitles the run's tab, notifies, and stores
#              observed.json as wait.sh's baseline
#   --refresh  wait.sh's tick: progress.md, tab title and notifications only; prints nothing, leaves
#              observed.json alone. SPIKE_OBS=<file> reuses that observation instead of running observe.sh
#   --status   writes nothing at all; prints the loop line, Needs you, In flight and the board
#   --dry-run  reads dry-status.json (init.sh --dry-run) and writes nothing but that board
# Needs you: blocked-ui, waiting-user (with the pane's question), halted (with ship's stage and last line),
# died (after its one auto-resume, or with no live loop to resume it) and held — each with the action to take.
# Notifies (notify.sh) once per entry into halted / died / blocked-ui / waiting-user, remembered in
# status.json `.notified`; a died ticket whose auto-resume is still pending isn't announced.
set -u
. "$(dirname "$0")/lib.sh"

EPIC=$(norm_epic "${1:-}") || exit 2
D=$(epic_dir "$EPIC") MODE=${2:-}
case "$MODE" in
  ""|--refresh) ;;
  --status|--dry-run) export SPIKE_READONLY=1 ;;
  *) echo "unknown flag $MODE"; exit 2 ;;
esac
if [ ! -f "$D/graph.json" ]; then
  case "$MODE" in
    --status|--dry-run) echo "no cached graph for $EPIC, fetching it" >&2; bash "$SP/graph.sh" "$EPIC" --fresh >/dev/null || exit 1 ;;
    *) echo "no graph for $EPIC — run graph.sh $EPIC"; exit 1 ;;
  esac
fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
if [ -n "${SPIKE_OBS:-}" ]; then cp "$SPIKE_OBS" "$TMP/obs.json" || exit 1
else bash "$SP/observe.sh" "$EPIC" > "$TMP/obs.json" || exit 1; fi
ST=$D/status.json; [ "$MODE" = --dry-run ] && ST=$D/dry-status.json
[ -f "$ST" ] && cp "$ST" "$TMP/st.json" || echo '{"dispatched":{}}' > "$TMP/st.json"
node "$SP/dag.mjs" next "$D/graph.json" "$TMP/obs.json" "$TMP/st.json" > "$TMP/dag.json" || { cat "$TMP/dag.json"; exit 1; }
LIVE=false; loop_live "$EPIC" && LIVE=true

# A died ticket (killed, not halted: ship's halts are deterministic) gets one --resume per run. It takes a
# slot like a dispatch and is spent from the same --max-tickets budget (a resume re-stamps its epoch).
jq -c --slurpfile s "$TMP/st.json" '
  ($s[0]) as $st | ($st.run_started // 0) as $rs | . as $n
  | [.halted[] | select(.state == "died") | .key as $k
     | select($st.dispatched[$k] != null and (($n.out_of_scope // []) | index($k) | not))
     | select((($st.auto_resumed[$k].epoch // -1) >= $rs) | not) | $k] as $p
  | ([.slots, (.budget_left // 1000)] | min) as $room
  | .auto_resume_pending = $p | .auto_resume = $p[:$room]
  | .dispatch = .dispatch[:([$room - (.auto_resume | length), 0] | max)]
  | if (.auto_resume | length) > 0 then .stalled = false | .held_done = false else . end' \
  "$TMP/dag.json" > "$TMP/next.json"

# {needs: [line], inflight: [line], title}
jq -c --slurpfile o "$TMP/obs.json" --slurpfile s "$TMP/st.json" --slurpfile g "$D/graph.json" --arg e "$EPIC" \
  --argjson live "$LIVE" --argjson now "$(date +%s)" '
  ($o[0]) as $o | ($s[0]) as $st | . as $w
  | def ago($t): if ($t // 0) == 0 then "?" else ($now - $t) as $x
      | if $x < 3600 then "\($x / 60 | floor) min" else "\($x / 3600 | floor) h \($x % 3600 / 60 | floor) min" end end;
    def pane($k): ($st.dispatched[$k].pane // $o[$k].pane // "?");
    def stage($k): ($o[$k].ship_stage // "an unknown stage");
    def q($k): ($o[$k].question // (($o[$k].pane_tail // "") | split("\n") | map(select(. != "")) | last) // "?");
    def relay($k): "`relay.sh \($e) \($k) --show`, ask the user, then `relay.sh \($e) \($k) --answer \"<their answer>\"`";
  [ ($w.halted[] | select(.state == "blocked-ui") | .key as $k
      | "- **\($k)** is on a prompt in pane \(pane($k)): “\(q($k))” → \(relay($k))"),
    ($w.waiting_user[] | .key as $k
      | "- **\($k)** is waiting on you in pane \(pane($k)) (\(.reason // "idle")): “\(q($k))” → \(relay($k))"),
    ($w.halted[] | select(.state == "halted") | .key as $k
      | "- **\($k)** halted at \(stage($k)): \($o[$k].last_line // $o[$k].halt_reason // "no reason recorded (`diagnose.sh \($e) \($k)`)") → fix it with `/ship \($k)` in pane \(pane($k)), or on the user’s ask `dispatch.sh \($e) \($k) --resume`"),
    ($w.halted[] | select(.state == "died") | .key as $k
      | if ($w.auto_resume_pending | index($k)) then
          (if $live then empty else "- **\($k)** died at \(stage($k)) → it auto-resumes once when the loop runs: `/spike \($e)`" end)
        else "- **\($k)** died again at \(stage($k)) after its auto-resume at \($st.auto_resumed[$k].at // "?") → on the user’s ask, `dispatch.sh \($e) \($k) --resume`" end),
    ($w.held[] | "- **\(.key)** is held at merge-gate: \(.reason // "hold-merge")\(if .pr_url then " (\(.pr_url))" else "" end) → merge the PR (or lift `hold-merge`), then `/ship \(.key)` to clean up")
  ] as $needs
  | [ ($w.inflight[] as $k
        | if $o[$k].reason == "starting" and ($o[$k].ship_stage | not) then "- \($k) · starting · \(ago($st.dispatched[$k].epoch)) · pane \(pane($k))"
          else "- \($k) · \(stage($k))\(if $o[$k].ship_result == "running" then "" else " (next)" end) · \(ago($o[$k].since)) · pane \(pane($k))" end),
      ($w.halted[] | select(.state == "died") | .key as $k | select($live and ($w.auto_resume_pending | index($k)))
        | "- \($k) · died at \(stage($k)) · auto-resume pending") ] as $fly
  | ([$g[0].nodes[] | select(.external | not) | .key] - ($w.out_of_scope // []) | length) as $total
  | {needs: $needs, inflight: $fly,
     title: ("spike · \($e) · \($w.done | length)/\($total) done"
             + (if ($w.inflight | length) > 0 then " · \($w.inflight | length) running" else "" end)
             + (if ($needs | length) > 0 then " · \($needs | length) needs you" else "" end))}' \
  "$TMP/next.json" > "$TMP/board.json"

head_blocks() {  # loop line, Needs you, In flight
  loop_line "$EPIC"
  echo; echo "## Needs you"; echo
  jq -r 'if (.needs | length) > 0 then .needs[] else "Nothing needs you." end' "$TMP/board.json"
  echo; echo "## In flight"; echo
  jq -r 'if (.inflight | length) > 0 then .inflight[] else "Nothing in flight." end' "$TMP/board.json"
}

counts() {
  jq -r '"\(.done | length) done · \(.inflight | length) in flight · \(.waiting_user | length) waiting on user · \(.eligible | length) eligible · \(.halted | length) halted · \(.held | length) held · \(.frozen | length) frozen"
         + (if .complete then " — epic complete" elif .held_done then " — only held tickets left: merge their PRs, then /ship <KEY>"
            elif .stalled then " — STALLED: nothing can progress" else "" end)' "$TMP/next.json"
}

table() {  # one row per in-scope ticket
  jq -r --slurpfile o "$TMP/obs.json" --slurpfile n "$TMP/next.json" --slurpfile s "$TMP/st.json" '
    ($n[0]) as $w | ($o[0]) as $o | ($s[0].dispatched // {}) as $d
    | "| ticket | state | detail | PR |", "|---|---|---|---|",
      (.nodes[] | select(.external | not) | .key as $k
       | ( if ($w.merged_outside // [] | index($k)) then "done (merged outside ship)"
           elif ($w.done | index($k)) then "done"
           elif ($w.inflight | index($k)) then "in flight"
           elif ([$w.waiting_user[]?.key] | index($k)) then "waiting on user"
           elif ($w.withdrawn // [] | index($k)) and (($o[$k].state // "none") == "withdrawn") then "withdrawn"
           elif ([$w.held[]?.key] | index($k)) then "held"
           elif ([$w.halted[].key] | index($k)) then ($o[$k].state)
           elif ($w.frozen | index($k)) then "frozen"
           elif ([$w.eligible[].key] | index($k)) then "eligible"
           elif ($w.out_of_scope | index($k)) then "out of scope"
           else "blocked" end ) as $state
       | ( ($w.blocked[$k] // []) as $b
           | if ($b | length) > 0 then "waits on \($b | join(", "))"
             else ($o[$k].reason // $o[$k].stage // "") end ) as $detail
       | "| \($k) \(.summary | .[0:60]) | \($state) | \($detail)\(if $d[$k] then " · pane \($d[$k].pane // $d[$k].agent)" else "" end) | \($o[$k].pr_url // "") |")' \
    "$D/graph.json"
}

extras() {  # sections under the table: panes waiting on the user, held tickets, soft dependencies
  jq -r '
    if (.waiting_user | length) > 0 then "", "## Waiting on the user", "",
      (.waiting_user[] | "- **\(.key)** — \(.reason // "idle")", ((.pane_tail // "") | split("\n")[] | select(. != "") | "    > \(.)"))
    else empty end,
    if (.held | length) > 0 then "", "## Held at merge-gate", "",
      "Green and waiting for your merge (or held by hold-merge). Merge the PR, or lift the label, then `/ship <KEY>` records it. Nothing is frozen; dependents wait.", "",
      (.held[] | "- **\(.key)** — \(.reason // "hold-merge")\(if .pr_url then " (\(.pr_url))" else "" end)")
    else empty end,
    if ([.soft_edges[]? ] | length) > 0 then "", "## Soft dependencies not linked as blocked-by in GitHub", "",
      "Ordering written in a description, not a Blocks link. Ask the user whether to link them.", "",
      (.soft_edges[] | "- \(.key) says \"\(.phrase)\" → \(.key) is blocked by \(.blocked_by)\(if .in_epic then "" else " (outside the epic)" end)\(if .satisfied then " (satisfied)" else "" end)")
    else empty end' "$TMP/next.json"
}

if [ "$MODE" = --status ] || [ "$MODE" = --dry-run ]; then
  [ "$MODE" = --dry-run ] && { jq -r '"would dispatch now: \(.dispatch | join(", ") | if . == "" then "nothing" else . end)",
    (if (.auto_resume | length) > 0 then "would auto-resume: \(.auto_resume | join(", "))" else empty end),
    "order: \([.eligible[] | "\(.key)(d\(.depth))"] | join(" > "))", (.errors[] | "ERROR: \(.)")' "$TMP/next.json"; rm -f "$ST"; }
  head_blocks
  echo; counts
  table
  extras
  [ "$(jq '.errors | length' "$TMP/next.json")" = 0 ] || exit 3
  exit 0
fi

{
  echo "# spike $EPIC"
  echo; echo "Updated $(now_iso). Graph hash $(jq -r .hash "$D/graph.json")."
  echo; head_blocks
  echo; echo "## Board"; echo; counts; echo; table
  extras
  echo; echo "## Graph"; echo; echo '```mermaid'
  node "$SP/dag.mjs" mermaid "$D/graph.json" "$TMP/obs.json" "$TMP/st.json"
  echo '```'
  [ -f "$D/log.md" ] && { echo; echo "## Log"; echo; cat "$D/log.md"; }
} > "$TMP/progress.md"
mv "$TMP/progress.md" "$D/progress.md"

TAB=$(live_tab "$EPIC") && T=$(jq -r .title "$TMP/board.json") &&
  [ "$(herdr tab get "$TAB" 2>/dev/null | jq -r '.result.tab.label')" != "$T" ] && herdr tab rename "$TAB" "$T" >/dev/null 2>&1

jq -c --slurpfile o "$TMP/obs.json" --slurpfile n "$TMP/next.json" --arg t "$(now_iso)" '
  (.notified // {}) as $old | ($n[0].auto_resume_pending // []) as $p
  | [$o[0] | to_entries[] | select(.value.state | IN("halted", "died", "blocked-ui", "waiting-user"))
     | select(.value.state != "died" or (.key as $k | $p | index($k) | not))
     | {key, state: .value.state, stage: (.value.ship_stage // "?"),
        msg: (.value.question // .value.last_line // .value.reason // "")}] as $now
  | {new: [$now[] | select($old[.key].state != .state)],
     map: ($now | map({(.key): {state, at: (if $old[.key].state == .state then $old[.key].at else $t end)}}) | add // {}),
     old: $old}' "$TMP/st.json" > "$TMP/notify.json"
jq -r '.new[] | [.key, .state, .stage, .msg] | @tsv' "$TMP/notify.json" | while IFS=$'\t' read -r k s g m; do
  case "$s" in
    halted) v="halted at $g" ;; died) v="died again at $g" ;;
    blocked-ui) v="is on a prompt" ;; *) v="is waiting on you" ;;
  esac
  bash "$SP/notify.sh" "spike · $EPIC" "$k $v${m:+: $m}" >/dev/null
  echo "$(now_iso) notified: $k $v" >> "$D/log.md"
done
jq -e '.map != .old' "$TMP/notify.json" >/dev/null &&
  es_set "$EPIC" '.notified = $m' --argjson m "$(jq -c .map "$TMP/notify.json")"

[ "$MODE" = --refresh ] && exit 0
cp "$TMP/obs.json" "$D/observed.json"   # wait.sh's baseline — taken BEFORE dispatch
cat "$TMP/next.json"
[ "$(jq '.errors | length' "$TMP/next.json")" = 0 ] || exit 3
