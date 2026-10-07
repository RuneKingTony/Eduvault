#!/bin/bash
# The only GitHub-touching script: an epic's sub-issues and their blocked-by links -> graph.json.
# Edges are normalised to blocked_by as the UNION of both sides (a child's blocked_by and another issue's
# blocks), so a link reported from either end is the same edge. A blocker outside the epic becomes an
# `external` node carrying its own state; dag.mjs treats it as satisfied only when closed (or merged, when
# ship's state.sh can tell).
#
# Soft dependencies: each child's body goes through soft-refs.jq ("do after / after / depends on / blocked by /
# needs EDU-n"; "before EDU-n" the other way). Those not already a blocked-by link land in `soft_edges`
# ([{key, blocked_by, from, phrase, in_epic}]); dag.mjs gates on them exactly like links and they enter `hash`.
#
# usage: graph.sh <EPIC> [--max-age S] [--fresh]
#   --max-age S  reuse the cached graph when younger than S seconds (a refresh is two gh-issues calls per child)
#   --fresh      always refetch
# A changed edge set is appended to <epic dir>/log.md ("<iso> graph changed: old->new (+A->B, -C->D)").
# Reads go through gh-issues.sh, so GH_ISSUES_FIXTURE_DIR makes this offline.
# exit:  0 written (prints {nodes, edges, hash, changed, soft_edges})   1 GitHub failed or the graph is invalid
set -u
. "$(dirname "$0")/lib.sh"

EPIC=$(norm_epic "${1:-}") || exit 2; shift
MAXAGE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --max-age) MAXAGE=${2:-900}; shift ;;
    --fresh) MAXAGE="" ;;
    *) echo "unknown flag $1"; exit 2 ;;
  esac; shift
done
OUT=$(epic_dir "$EPIC")/graph.json LOG=$(epic_dir "$EPIC")/log.md
if [ -n "$MAXAGE" ] && [ -f "$OUT" ] && [ $(( $(date +%s) - $(stat -f %m "$OUT" 2>/dev/null || stat -c %Y "$OUT") )) -lt "$MAXAGE" ]; then
  jq -c '{nodes: (.nodes | length), edges: ([.edges[] | length] | add // 0), hash, changed: false, cached: true,
          soft_edges: (.soft_edges // [] | length)}' "$OUT"; exit 0
fi
mkdir -p "$(dirname "$OUT")"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
done_re='^(closed|done|resolved)$'
N=${EPIC#EDU-}
# a failing gh-issues.sh prints {"error": ...} on stdout; surface it
call() { local o; o=$("$GH" "$@" 2>/dev/null) || { echo "github: gh-issues.sh $* failed: $(jq -r '.error // empty' <<<"$o" 2>/dev/null)" >&2; return 1; }; printf '%s' "$o"; }

call list-children "$N" > "$TMP/ch.raw" || exit 1
jq -c '[(if type == "array" then . else .children end)[] | {key: "EDU-\(.number)", number, summary: (.title // ""), state: (.state // "open")}]' \
  "$TMP/ch.raw" > "$TMP/children.json" 2>/dev/null || { echo "github: list-children $N returned something unreadable"; exit 1; }
[ "$(jq length "$TMP/children.json")" -gt 0 ] || { echo "$EPIC has no sub-issues"; exit 1; }

echo '[]' > "$TMP/pairs.json"   # [[blocked, blocker], ...]
echo '[]' > "$TMP/soft.json"    # [[blocked, blocker, from, phrase], ...]
echo '[]' > "$TMP/full.json"    # children with their real title/state/body
for n in $(jq -r '.[].number' "$TMP/children.json"); do
  k=EDU-$n
  call get-issue "$n" > "$TMP/i.json" || exit 1
  jq -e '.number' "$TMP/i.json" >/dev/null 2>&1 || { echo "github: get-issue $n returned no issue"; exit 1; }
  call list-links "$n" > "$TMP/l.json" || exit 1
  jq --arg k "$k" '[(.blocked_by // [])[] | [$k, "EDU-\(if type == "object" then .number else . end)"]]
                   + [(.blocks // [])[] | ["EDU-\(if type == "object" then .number else . end)", $k]]' "$TMP/l.json" > "$TMP/p.json" ||
    { echo "github: list-links $n returned something unreadable"; exit 1; }
  jq --arg k "$k" '[.soft_refs[] | if .dir == "before" then [.key, $k, $k, .phrase] else [$k, .key, $k, .phrase] end]' \
    <(jq -c --arg self "$k" -f "$SP/soft-refs.jq" "$TMP/i.json") > "$TMP/s.json" || { echo "soft-refs.jq could not parse $k's body"; exit 1; }
  jq -s 'add' "$TMP/pairs.json" "$TMP/p.json" > "$TMP/n.json" && mv "$TMP/n.json" "$TMP/pairs.json"
  jq -s 'add' "$TMP/soft.json" "$TMP/s.json" > "$TMP/n.json" && mv "$TMP/n.json" "$TMP/soft.json"
  jq -s '.[0] + [.[1] | {key: "EDU-\(.number)", summary: .title, status: .state}]' "$TMP/full.json" "$TMP/i.json" > "$TMP/n.json" && mv "$TMP/n.json" "$TMP/full.json"
done

# a child blocking an issue outside this epic is harmless (this epic unblocks a later one): drop it
jq --slurpfile c "$TMP/children.json" '[$c[0][].key] as $ks | map(select(.[0] as $b | $ks | index($b)))' \
  "$TMP/pairs.json" > "$TMP/n.json" && mv "$TMP/n.json" "$TMP/pairs.json"

# blockers that are not children of the epic, linked or named in a child's text -> fetch their state
echo '[]' > "$TMP/ext.json"
for x in $(jq -r --slurpfile c "$TMP/children.json" --slurpfile s "$TMP/soft.json" '[$c[0][].key] as $ks
    | [.[][1]] + [$s[0][] | select(.[0] as $a | $ks | index($a)) | .[1]] - $ks | unique[]' "$TMP/pairs.json"); do
  call get-issue "${x#EDU-}" > "$TMP/x.raw" 2>/dev/null && jq -e '.number' "$TMP/x.raw" >/dev/null 2>&1 ||
    { echo "$x (a blocker of a ticket in $EPIC, by link or in its text) does not resolve on GitHub"; exit 1; }
  st=$(jq -r '.state // ""' "$TMP/x.raw")
  m=false; printf '%s' "$st" | tr '[:upper:]' '[:lower:]' | grep -qE "$done_re" ||
    { [ -f "$W/state.sh" ] && bash "$W/state.sh" dep-status "$x" "$st" >/dev/null 2>&1 && m=true; }
  jq --arg k "$x" --argjson m "$m" '{key: $k, summary: .title, status: .state, merged: $m}' "$TMP/x.raw" > "$TMP/x.json"
  jq -s '.[0] + [.[1]]' "$TMP/ext.json" "$TMP/x.json" > "$TMP/n.json" && mv "$TMP/n.json" "$TMP/ext.json"
done

jq -n --arg epic "$EPIC" --arg re "$done_re" \
  --slurpfile c "$TMP/children.json" --slurpfile f "$TMP/full.json" --slurpfile x "$TMP/ext.json" --slurpfile p "$TMP/pairs.json" \
  --slurpfile s "$TMP/soft.json" '
  ($p[0] | unique) as $pairs
  | ([$c[0][].key]) as $ks
  | {epic: $epic,
     nodes: ([$f[0][] | {key, summary, status, done: (.status | ascii_downcase | test($re)), external: false}]
           + [$x[0][] | {key, summary, status, done: ((.status | ascii_downcase | test($re)) or .merged), external: true}]),
     edges: (reduce $pairs[] as $e ({}; .[$e[0]] += [$e[1]]) | map_values(unique)),
     soft_edges: ([$s[0][] | select(. as $e | $pairs | index([[$e[0], $e[1]]]) | not)
                   | {key: .[0], blocked_by: .[1], from: .[2], phrase: .[3],
                      in_epic: ((.[0] as $a | $ks | index($a)) != null and (.[1] as $b | $ks | index($b)) != null)}]
                  | unique_by([.key, .blocked_by])),
     hash: (([$s[0][] | select(.[0] as $a | $ks | index($a)) | [.[0], .[1]]] | unique) as $sp
            | if $sp == [] then $pairs else [$pairs, $sp] end | tostring)}' > "$TMP/g.json"
H=$(jq -r .hash "$TMP/g.json" | shasum | cut -c1-12)
jq --arg h "$H" '.hash = $h' "$TMP/g.json" > "$TMP/g2.json"

node "$SP/dag.mjs" validate "$TMP/g2.json" > "$TMP/v.json" || { jq -r '.errors[]' "$TMP/v.json"; exit 1; }
PREV=$(jq -r '.hash // empty' "$OUT" 2>/dev/null)
if [ -n "$PREV" ] && [ "$PREV" != "$H" ]; then
  delta=$(jq -rn --slurpfile a "$OUT" --slurpfile b "$TMP/g2.json" '
    def pairs: [.edges | to_entries[] | .key as $k | .value[] | "\(.)→\($k)"] + [.soft_edges[]? | "\(.blocked_by)⇢\(.key)"];
    ($a[0] | pairs) as $o | ($b[0] | pairs) as $n
    | [(($n - $o)[] | "+\(.)"), (($o - $n)[] | "-\(.)")] | join(", ")')
  echo "$(now_iso) graph changed: ${PREV}→${H}${delta:+ ($delta)}" >> "$LOG"
fi
mv "$TMP/g2.json" "$OUT"
jq -c --arg prev "$PREV" '{nodes: (.nodes | length), edges: ([.edges[] | length] | add // 0), hash,
       changed: ($prev != "" and $prev != .hash), soft_edges: (.soft_edges | length)}' "$OUT"
