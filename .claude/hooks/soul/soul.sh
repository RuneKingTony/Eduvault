#!/bin/bash
# SOUL helper: the only thing that touches the log cursor, policies and proposals.
#   bash .claude/hooks/soul/soul.sh <command> [args]
set -u
source "$(dirname "$0")/lib.sh"

die() { echo "soul: $*" >&2; exit "${2:-1}"; }
ID_RE='^[a-z][a-z0-9-]*-[0-9]{3}$'

usage() {
  cat <<'USAGE'
soul.sh commands
  status                     counts of decisions, undistilled records, policies, proposals
  pending                    undistilled records, one per line: <log line><TAB><record>
  advance <line>             move the watermark (forward only, never past the log end)
  check-watermark            fail when the log was edited under the watermark
  policies                   one line per reviewed policy: [id] statement
  policy <id>                the full policy block
  next-id <slug>             next free id in a section
  validate                   check policy format, budgets and unique ids
  confirm <id> <weight> <record-ids> "<note>"
                             add evidence; queues a confidence raise when a rung is passed
  propose -                  queue a create or revise from JSON on stdin
  review                     show pending proposals
  accept <id> | reject <id> "<reason>"
USAGE
}

policy_files() { ls "$SOUL_SEED"/*.md 2>/dev/null; }

# Block for an id: the statement line plus its indented "  - " lines.
block_of() {
  local f
  for f in $(policy_files); do
    awk -v id="$1" '
      index($0, "- `[" id "]`") == 1 { on = 1; print; next }
      on && /^  - / { print; next }
      on { exit }
    ' "$f" | grep . && return 0
  done
  return 1
}

file_of() {
  local f
  for f in $(policy_files); do
    grep -q -F -- "- \`[$1]\`" "$f" && { echo "$f"; return 0; }
  done
  return 1
}

# set_field <id> statement|why|evidence <value>
set_field() {
  local f; f=$(file_of "$1") || die "unknown policy $1"
  FIELD="$2" VAL="$3" awk -v id="$1" '
    index($0, "- `[" id "]`") == 1 {
      on = 1
      if (ENVIRON["FIELD"] == "statement") { print "- `[" id "]` " ENVIRON["VAL"]; next }
      print; next
    }
    on && /^  - / {
      if (ENVIRON["FIELD"] == "why" && $0 ~ /^  - why:/) { print "  - why: " ENVIRON["VAL"]; next }
      if (ENVIRON["FIELD"] == "evidence" && $0 ~ /^  - evidence:/) { print "  - evidence: " ENVIRON["VAL"]; next }
      print; next
    }
    { on = 0; print }
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
}

evidence_of() { block_of "$1" | sed -n 's/^  - evidence: //p'; }

cmd_policies() {
  local f
  for f in $(policy_files); do
    sed -n 's/^- `\[\([a-z0-9-]*\)\]` /[\1] /p' "$f"
  done
}

cmd_pending() {
  [ -f "$SOUL_LOG" ] || return 0
  awk -v w="$(soul_watermark)" 'NR > w { print NR "\t" $0 }' "$SOUL_LOG"
}

cmd_advance() {
  local n="${1:-}" cur total last
  case "$n" in ''|*[!0-9]*) die "advance needs a line number" 2;; esac
  cur=$(soul_watermark); total=$(soul_log_lines)
  [ "$n" -lt "$cur" ] && die "refusing to move the watermark backwards ($cur -> $n)" 2
  [ "$n" -gt "$total" ] && die "refusing to move past the end of the log ($total lines)" 2
  mkdir -p "$SOUL_DIR"
  last=$(sed -n "${n}p" "$SOUL_LOG" | jq -r '.id // empty' 2>/dev/null)
  jq -cn --argjson n "$n" --arg id "$last" --arg at "$(soul_today)" '{lines: $n, last_id: $id, at: $at}' > "$SOUL_WATERMARK"
  echo "watermark: $n"
}

cmd_check_watermark() {
  local w want got
  w=$(soul_watermark)
  [ "$w" -eq 0 ] && return 0
  want=$(jq -r '.last_id // empty' "$SOUL_WATERMARK")
  got=$(sed -n "${w}p" "$SOUL_LOG" 2>/dev/null | jq -r '.id // empty' 2>/dev/null)
  [ "$want" = "$got" ] || { echo "soul: the log was edited under the watermark (line $w)" >&2; exit 1; }
}

cmd_status() {
  local n
  n=$(ls "$SOUL_PROPOSALS"/*.json 2>/dev/null | wc -l | tr -d ' ')
  echo "decisions: $(soul_log_lines)"
  echo "undistilled: $(( $(soul_log_lines) - $(soul_watermark) ))"
  echo "policies: $(cmd_policies | wc -l | tr -d ' ')"
  echo "proposals: $n"
}

cmd_policy() { block_of "${1:-}" || die "unknown policy ${1:-}"; }

cmd_next_id() {
  local slug="${1:-}" max
  [ -n "$slug" ] || die "next-id needs a section slug" 2
  max=$(cat "$SOUL_SEED"/*.md "$SOUL_DIR/rejected.md" 2>/dev/null | grep -oE "\[$slug-[0-9]{3}\]" | tr -dc '0-9\n' | sort -n | tail -1)
  printf '%s-%03d\n' "$slug" $(( 10#${max:-0} + 1 ))
}

cmd_validate() {
  local f slug rc=0 ids line id st why ev
  ids=$(cat "$SOUL_SEED"/*.md 2>/dev/null | grep -oE '^- `\[[^]]*\]`' | sed -E 's/^- `\[(.*)\]`$/\1/' | sort | uniq -d)
  [ -n "$ids" ] && { echo "duplicate ID: $ids" >&2; rc=1; }
  for f in $(policy_files); do
    slug=$(basename "$f" .md)
    while IFS= read -r line; do
      case "$line" in
        '# '*|'') ;;
        '- `['*)
          id=$(sed -E 's/^- `\[([^]]*)\]`.*/\1/' <<<"$line")
          st=$(sed -E 's/^- `\[[^]]*\]` ?//' <<<"$line")
          [[ "$id" =~ $ID_RE ]] || { echo "$f: bad id $id" >&2; rc=1; }
          [ "${id%-[0-9][0-9][0-9]}" = "$slug" ] || { echo "$f: $id does not belong to section $slug" >&2; rc=1; }
          [ "${#st}" -gt 300 ] && { echo "$f: $id statement is ${#st} chars (max 300)" >&2; rc=1; }
          [ -z "$st" ] && { echo "$f: $id has no statement" >&2; rc=1; }
          ;;
        '  - why: '*)
          why="${line#  - why: }"
          [ "${#why}" -gt 200 ] && { echo "$f: why is ${#why} chars (max 200)" >&2; rc=1; }
          ;;
        '  - evidence: '*)
          ev="${line#  - evidence: }"
          [[ "$ev" =~ ^score\ [0-9.]+\ ·\ [0-9]+\ decisions\ ·\ last\ confirmed\ [0-9]{4}-[0-9]{2}-[0-9]{2}\ ·\ confidence:\ (low|medium|high)$ ]] \
            || { echo "$f: bad evidence line: $ev" >&2; rc=1; }
          ;;
        *) echo "$f: unexpected line: $line" >&2; rc=1 ;;
      esac
    done < "$f"
  done
  [ "$rc" -eq 0 ] && echo "valid"
  return "$rc"
}

rung() { awk -v s="$1" 'BEGIN { print (s >= 6 ? "high" : (s >= 3 ? "medium" : "low")) }'; }
rank() { case "$1" in low) echo 1;; medium) echo 2;; *) echo 3;; esac; }

queue() {
  mkdir -p "$SOUL_PROPOSALS"
  jq -c --arg at "$(soul_today)" '. + {at: $at}' <<<"$1" > "$SOUL_PROPOSALS/$2.json"
}

cmd_confirm() {
  local id="${1:-}" w="${2:-}" recs="${3:-}" note="${4:-held}" ev score dec conf new_score new_dec new_conf
  [ -n "$id" ] && [ -n "$w" ] || die "confirm <id> <weight> <record-ids> \"<note>\"" 2
  [[ "$w" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "weight must be a number" 2
  ev=$(evidence_of "$id") || true
  [ -n "$ev" ] || die "unknown policy $id"
  score=$(sed -E 's/^score ([0-9.]+) .*/\1/' <<<"$ev")
  dec=$(sed -E 's/^score [0-9.]+ · ([0-9]+) decisions.*/\1/' <<<"$ev")
  conf=$(sed -E 's/.*confidence: ([a-z]+).*/\1/' <<<"$ev")
  new_score=$(awk -v a="$score" -v b="$w" 'BEGIN { printf "%g", a + b }')
  new_dec=$(( dec + $(tr ',' '\n' <<<"$recs" | grep -c .) ))
  set_field "$id" evidence "score $new_score · $new_dec decisions · last confirmed $(soul_today) · confidence: $conf"
  mkdir -p "$SOUL_DIR/notes"
  echo "- $(soul_today) confirmed · $note · records: $recs" >> "$SOUL_DIR/notes/$id.md"
  new_conf=$(rung "$new_score")
  if [ "$(rank "$new_conf")" -gt "$(rank "$conf")" ]; then
    queue "$(jq -cn --arg id "$id" --arg from "$conf" --arg to "$new_conf" --arg r "score reached $new_score" '{op: "raise", id: $id, from: $from, to: $to, rationale: $r}')" "$id"
    echo "queued: raise $id $conf -> $new_conf"
  fi
}

cmd_propose() {
  local json id op slug st why f
  [ "${1:-}" = "-" ] || die "propose reads JSON from stdin: propose -" 2
  json=$(cat)
  jq -e . >/dev/null 2>&1 <<<"$json" || die "proposal is not valid JSON"
  op=$(jq -r '.op // empty' <<<"$json"); id=$(jq -r '.id // empty' <<<"$json")
  [[ "$id" =~ $ID_RE ]] || die "bad id '$id' (expected slug-NNN)"
  slug="${id%-[0-9][0-9][0-9]}"
  st=$(jq -r '.statement // empty' <<<"$json"); why=$(jq -r '.why // empty' <<<"$json")
  case "$op" in
    create)
      file_of "$id" >/dev/null && die "$id already exists"
      grep -q -F "[$id]" "$SOUL_DIR/rejected.md" 2>/dev/null && die "$id was rejected; use a new id"
      [ -n "$st" ] && [ -n "$why" ] || die "create needs statement and why"
      f="$SOUL_SEED/$slug.md"
      [ -f "$f" ] || [ -n "$(jq -r '.section_title // empty' <<<"$json")" ] || die "a new section $slug needs section_title"
      ;;
    revise)
      file_of "$id" >/dev/null || die "unknown policy $id"
      [ -n "$st" ] || [ -n "$why" ] || die "revise needs statement or why"
      ;;
    *) die "op must be create or revise (raises are queued by confirm)" ;;
  esac
  [ "${#st}" -le 300 ] || die "statement is ${#st} chars (max 300)"
  [ "${#why}" -le 200 ] || die "why is ${#why} chars (max 200)"
  queue "$json" "$id"
  echo "queued: $op $id"
}

cmd_review() {
  local p n=0 op id
  for p in "$SOUL_PROPOSALS"/*.json; do
    [ -f "$p" ] || continue
    n=$((n + 1)); op=$(jq -r .op "$p"); id=$(jq -r .id "$p")
    echo "[$n] $op $id"
    case "$op" in
      create) jq -r '"+ " + .statement, "  why: " + .why' "$p" ;;
      revise)
        block_of "$id" | sed -n '1p' | sed 's/^/- /'
        jq -r 'if .statement then "+ " + .statement else empty end, if .why then "  why: " + .why else empty end' "$p" ;;
      raise) jq -r '"  confidence " + .from + " -> " + .to' "$p" ;;
    esac
    jq -r '"  rationale: " + (.rationale // "-"), "  records: " + ((.records // []) | join(","))' "$p"
  done
  [ "$n" -eq 0 ] && echo "no pending proposals"
  return 0
}

cmd_accept() {
  local id="${1:-}" p op slug f st why recs conf score ev
  p="$SOUL_PROPOSALS/$id.json"
  [ -f "$p" ] || die "no pending proposal for ${id:-<id>}"
  op=$(jq -r .op "$p")
  case "$op" in
    create)
      slug="${id%-[0-9][0-9][0-9]}"; f="$SOUL_SEED/$slug.md"
      st=$(jq -r .statement "$p"); why=$(jq -r .why "$p")
      score=$(jq -r '.score // 3' "$p"); recs=$(jq -r '(.records // []) | length' "$p")
      conf=$(jq -r --arg d "$(rung "$score")" '.confidence // $d' "$p")
      mkdir -p "$SOUL_SEED"
      if [ ! -f "$f" ]; then printf '# %s\n' "$(jq -r .section_title "$p")" > "$f"; fi
      printf '\n- `[%s]` %s\n  - why: %s\n  - evidence: score %s · %s decisions · last confirmed %s · confidence: %s\n' \
        "$id" "$st" "$why" "$score" "$recs" "$(soul_today)" "$conf" >> "$f"
      ;;
    revise)
      st=$(jq -r '.statement // empty' "$p"); why=$(jq -r '.why // empty' "$p")
      [ -n "$st" ] && set_field "$id" statement "$st"
      [ -n "$why" ] && set_field "$id" why "$why"
      ;;
    raise)
      ev=$(evidence_of "$id")
      set_field "$id" evidence "$(sed -E "s/confidence: [a-z]+/confidence: $(jq -r .to "$p")/" <<<"$ev")"
      ;;
  esac
  mkdir -p "$SOUL_DIR/notes"
  echo "- $(soul_today) $op accepted" >> "$SOUL_DIR/notes/$id.md"
  rm -f "$p"
  cmd_validate >/dev/null || die "accepted, but the profile no longer validates; run validate"
  echo "accepted: $op $id"
}

cmd_reject() {
  local id="${1:-}" reason="${2:-}" p
  p="$SOUL_PROPOSALS/$id.json"
  [ -f "$p" ] || die "no pending proposal for ${id:-<id>}"
  [ -n "$reason" ] || die "reject needs a reason" 2
  mkdir -p "$SOUL_DIR"
  echo "- $(soul_today) \`[$id]\` $(jq -r .op "$p"): $reason" >> "$SOUL_DIR/rejected.md"
  rm -f "$p"
  echo "rejected: $id"
}

CMD="${1:-}"; [ $# -gt 0 ] && shift
case "$CMD" in
  status) cmd_status ;;
  pending) cmd_pending ;;
  advance) cmd_advance "$@" ;;
  check-watermark) cmd_check_watermark ;;
  policies) cmd_policies ;;
  policy) cmd_policy "$@" ;;
  next-id) cmd_next_id "$@" ;;
  validate) cmd_validate ;;
  confirm) cmd_confirm "$@" ;;
  propose) cmd_propose "$@" ;;
  review) cmd_review ;;
  accept) cmd_accept "$@" ;;
  reject) cmd_reject "$@" ;;
  *) usage; [ -z "$CMD" ] || exit 2 ;;
esac
