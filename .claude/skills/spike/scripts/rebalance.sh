#!/bin/bash
# Even out the run tab's ticket columns: every top-row pane gets W/N of the tab's width, and every
# ship worker sits under its own ticket pane.
# Split-time ratios can't keep columns equal once panes close (Herdr hands a closed pane's width to
# its tree neighbour) or a refill splits an already-narrow rightmost column, so this runs after
# every dispatch and reap. `pane resize --direction D --amount X` moves the pane's D-side boundary
# by X (unsigned, a fraction of the owning split, clamped to 0.1–0.9), so a boundary goes right via
# the pane on its left and left via the pane on its right. Moving one boundary can rescale others
# nested under the same split, so it repeats until every edge is within a cell of its target.
#
# usage: rebalance.sh <TAB>   silent; exits 0 even when the tab is gone
set -u
TAB=$1
P=$(herdr tab get "$TAB" 2>/dev/null | jq -r '.result.tab.root_pane.pane_id // empty')
[ -n "$P" ] || P=$(herdr pane list 2>/dev/null | jq -r --arg t "$TAB" '[.result.panes[] | select(.tab_id == $t)][0].pane_id // empty')
[ -n "$P" ] || exit 0

# A column is split right from a single pane, so a ticket dispatched beside a column that already
# has its ship worker lands in that pane's top half and the worker ends up spanning several columns.
# Re-home each such worker under its own ticket pane: moving it out collapses the tree back to plain
# columns, moving it back splits only its ticket's column. The worker's process survives the moves.
herdr pane list 2>/dev/null | jq -r --arg t "$TAB" '
  [.result.panes[] | select(.tab_id == $t)] as $ps
  | $ps[] | select((.label // "") | startswith("ship worker · ")) as $w
  | ($w.label | split(" · ")[1]) as $k
  | ($ps[] | select(.label == "spike · \($k)")) | "\($w.pane_id) \(.pane_id)"' |
while read -r worker ticket; do
  wide=$(herdr pane layout --pane "$ticket" 2>/dev/null | jq -r --arg w "$worker" --arg p "$ticket" '
    .result.layout.panes as $ps | ($ps[] | select(.pane_id == $w).rect) as $a | ($ps[] | select(.pane_id == $p).rect) as $b
    | ($a.x != $b.x or $a.width != $b.width)')
  [ "$wide" = true ] || continue
  herdr pane move "$worker" --new-tab --no-focus >/dev/null 2>&1 || continue
  herdr pane move "$worker" --tab "$TAB" --target-pane "$ticket" --split down --ratio 0.65 --no-focus >/dev/null 2>&1
done

for _ in $(seq 1 40); do   # one boundary per pass
  moves=$(herdr pane layout --pane "$P" 2>/dev/null | jq -r '
    .result.layout as $l | $l.area as $a
    | [$l.panes[] | select(.rect.y == $a.y)] | sort_by(.rect.x) as $top | ($top | length) as $n
    | range(0; $n - 1) as $i | $top[$i] as $p
    | ($p.rect.x + $p.rect.width) as $r
    | ($a.x + (($a.width * ($i + 1) / $n) | round)) as $t
    | select(($t - $r) | fabs > 1)
    | [$l.splits[] | select(.direction == "right"
        and .rect.y <= $p.rect.y and $p.rect.y < .rect.y + .rect.height
        and ((.rect.x + .ratio * .rect.width) - $r | fabs) <= 1)][0] as $s
    | select($s)
    | (($t - $r) / $s.rect.width) as $d
    | if $d > 0 then "\($p.pane_id) right \($d)" else "\($top[$i + 1].pane_id) left \(-$d)" end' | head -1)
  [ -n "$moves" ] || exit 0
  read -r pane dir amount <<<"$moves"
  herdr pane resize --pane "$pane" --direction "$dir" --amount "$amount" 2>/dev/null |
    jq -e '.result.resize.changed' >/dev/null || exit 0
done
