# Ordering stated in an issue's text. Input: the gh-issues.sh get-issue object. Arg: $self (EDU-n).
# "do after / after / depends on / blocked by / needs EDU-1, EDU-2 and EDU-3" -> this ticket waits on them (dir "after");
# "before EDU-X" -> EDU-X waits on this one (dir "before"). A GitHub issue URL counts as its key.
def soft_refs($self): (.body // "") | gsub("https?://\\S*/issues/(?<k>[0-9]+)\\S*"; "EDU-" + .k)
    | [scan("(?i)\\b(do after|depends on|blocked by|needs|after|before)[:\\s]+((?:EDU-[0-9]+(?:[,\\s]+(?:and\\s+)?)?)+)")
       | (.[0] | ascii_downcase) as $p | .[1] | scan("(?i)EDU-[0-9]+") | ascii_upcase | select(. != $self)
       | {key: ., dir: (if $p == "before" then "before" else "after" end), phrase: "\($p) \(.)"}]
    | unique_by([.key, .dir]);
{soft_refs: soft_refs($self)}
