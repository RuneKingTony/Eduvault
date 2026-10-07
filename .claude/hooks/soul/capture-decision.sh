#!/bin/bash
# PostToolUse hook on AskUserQuestion. Appends one JSONL record per question to
# .claude/soul/decisions.jsonl and always exits 0, so it never blocks the user.
#
# Fields distill relies on:
#   recommended  the option labelled "(Recommended)"; the marker is stripped from labels
#   answer_kind  recommended | option | free_text | none
#   notes        text typed alongside a selection
#   policy_ids   [slug-NNN] ids cited in the recommendation
#   header       mapped onto headers.json; header_known:false flags an unmapped one
#   source       "human" unless the payload carries its own top-level source (e.g. "auto")
# Questions under the "Soul review" header are not logged: they judge the profile itself.

source "$(dirname "$0")/lib.sh"

INPUT=$(cat)

{
  mkdir -p "$SOUL_DIR"

  CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
  BRANCH=""
  [ -n "$CWD" ] && BRANCH=$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null)
  ISSUE=$(printf '%s' "$BRANCH" | grep -oiE 'edu-?[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]' | sed -E 's/^EDU-?/EDU-/')

  printf '%s' "$INPUT" | jq -c \
    --slurpfile hdr "$SOUL_HEADERS" \
    --arg branch "$BRANCH" --arg issue "$ISSUE" '
    def rec_re: "\\s*\\(Recommended\\)\\s*$";
    def strip_rec: if type == "string" then sub(rec_re; "") else . end;
    def trim: gsub("^\\s+|\\s+$"; "");

    ($hdr[0].headers
      | map(. as $h | ([$h.name] + ($h.aliases // [])) | map({key: (ascii_downcase), value: $h.name}))
      | flatten | from_entries) as $lookup
    | . as $root
    | ($root.tool_response.answers // {}) as $answers
    | (($root.tool_input.annotations // {}) + ($root.tool_response.annotations // {})) as $ann
    | ($root.tool_input.questions // [])[]
    | . as $q
    | select((($q.header // "") | trim | ascii_downcase) != "soul review")
    | [($q.options // [])[] | {
          label: (.label | strip_rec),
          description: (.description // null),
          rec: ((.label // "") | test(rec_re))
        }] as $o
    | ([$o[] | select(.rec) | .label] | .[0]) as $rec
    | [$o[].label] as $labels
    | ($answers[$q.question] // null | strip_rec) as $ans
    | (if $ans == null then []
       elif ($labels | index($ans)) != null then [$ans]
       elif ($q.multiSelect // false) then ($ans | split(",") | map(trim | strip_rec))
       else [$ans] end) as $parts
    | (if $ans == null then "none"
       elif ($parts | all(. as $p | $labels | index($p) != null)) | not then "free_text"
       elif $rec != null and $parts == [$rec] then "recommended"
       else "option" end) as $kind
    | (($q.header // "") | trim) as $raw
    | ($lookup[$raw | ascii_downcase] // null) as $canon
    | {
        v: 1,
        ts: (now | todate),
        session: $root.session_id,
        cwd: $root.cwd,
        branch: (if $branch == "" then null else $branch end),
        issue: (if $issue == "" then null else $issue end),
        question: $q.question,
        header: ($canon // $raw),
        header_raw: $raw,
        header_known: ($canon != null),
        multi_select: ($q.multiSelect // false),
        options: [$o[] | {label, description}],
        recommended: $rec,
        answer: $ans,
        answer_kind: $kind,
        notes: ($ann[$q.question].notes // null),
        policy_ids: (
          ([$o[] | select(.rec) | .description // ""] + [$q.question]) | join(" ")
          | [scan("\\[([a-z][a-z0-9-]*-[0-9]{3})\\]") | .[0]] | unique
        ),
        source: ($root.source // "human")
      }
  ' | while IFS= read -r REC; do
    ID=$(printf '%s' "$REC" | shasum | cut -c1-10)
    printf '%s' "$REC" | jq -c --arg id "$ID" '{id: $id} + .'
  done > "$SOUL_DIR/.capture.$$"

  # Parallel sessions append concurrently; a mkdir mutex keeps long records from interleaving.
  # A lock older than 30s is a crashed writer and is cleared.
  for _ in $(seq 1 60); do
    mkdir "$SOUL_DIR/.append.lock" 2>/dev/null && break
    AGE=$(( $(date +%s) - $(stat -f %m "$SOUL_DIR/.append.lock" 2>/dev/null || stat -c %Y "$SOUL_DIR/.append.lock" 2>/dev/null || echo 0) ))
    [ "$AGE" -gt 30 ] && rmdir "$SOUL_DIR/.append.lock" 2>/dev/null
    sleep 0.5
  done
  cat "$SOUL_DIR/.capture.$$" >> "$SOUL_LOG"
  rmdir "$SOUL_DIR/.append.lock" 2>/dev/null
  rm -f "$SOUL_DIR/.capture.$$"
} 2>/dev/null

exit 0
