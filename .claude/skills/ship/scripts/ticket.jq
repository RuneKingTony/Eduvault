# gh-issues.sh get-issue JSON -> the canonical ticket.json. $old = the existing ticket.json, whose
# non-canonical fields are kept. Used by `state.sh fetch-ticket`.
def lines: (.body // "") | split("\n");
def ac: reduce lines[] as $l ({on: false, out: []};
    if ($l | test("^#{1,6}\\s")) then
      .on = ($l | test("^#{1,6}\\s*(acceptance criteria|definition of done|done when)\\b"; "i"))
    elif .on then
      ([$l | capture("^\\s*(?:[-*]|[0-9]+[.)])\\s+(?:\\[[ xX]\\]\\s*)?(?<t>.*\\S)")] | first // null) as $m
      | if $m then .out += [$m.t] else . end
    else . end) | .out;
# "after / blocked by / depends on / needs EDU-1, #2 and #3" -> this issue waits on them;
# "before #4" -> #4 waits on this one.
def soft_refs($self): (.body // "")
    | [scan("(after|blocked by|depends on|needs|before)[:\\s]+((?:(?:EDU-|#)[0-9]+(?:[,\\s]+(?:and\\s+)?)?)+)"; "i")
       | (.[0] | ascii_downcase) as $p | .[1] | scan("(?:EDU-|#)([0-9]+)") | "EDU-" + .[0]
       | select(. != $self)
       | {key: ., dir: (if $p == "before" then "before" else "after" end), phrase: "\($p) \(.)"}]
    | unique_by([.key, .dir]);

("EDU-" + (.number | tostring)) as $k
| $old + {
    key: $k,
    number: .number,
    summary: .title,
    description: (.body // ""),
    acceptance_criteria: ac,
    state: (.state // "open" | ascii_downcase),
    labels: (.labels // []),
    parent: (if .parent then "EDU-\(.parent)" else null end),
    children: (.children // []),
    links: [(.blocked_by // [])[] | {type: "blocks", direction: "inward", phrase: "blocked by", key: "EDU-\(.)"}],
    soft_deps: [soft_refs($k)[] | select(.dir == "after") | .key],
    soft_refs: soft_refs($k),
    fetched_at: $t
  }
