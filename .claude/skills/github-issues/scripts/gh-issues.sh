#!/usr/bin/env bash
# One JSON line on stdout per call; non-zero exit on error.
set -euo pipefail

STATES=(in-progress in-review hold-merge)

die() {
  jq -nc --arg e "$1" '{error:$e}'
  exit "${2:-1}"
}

command -v jq >/dev/null || { echo '{"error":"jq is required"}'; exit 2; }

YES=0
ARGS=()
for a in "$@"; do
  if [ "$a" = "--yes" ]; then YES=1; else ARGS+=("$a"); fi
done
set -- ${ARGS[@]+"${ARGS[@]}"}

VERB="${1:-}"
[ -n "$VERB" ] || die "usage: gh-issues.sh <verb> ... (get-issue|search|comment|transition|create-link|list-links|list-children|edit-issue|assign|create-issue|close-issue)"
shift

FIX="${GH_ISSUES_FIXTURE_DIR:-}"

need_num() { [[ "${1:-}" =~ ^[0-9]+$ ]] || die "$VERB: issue number required, got '${1:-}'"; }


# True when the call must not mutate: no --yes, or fixture mode.
is_dry() { [ "$YES" -ne 1 ] || [ -n "$FIX" ]; }

require_fixture() {
  [ -f "$FIX/issue-$1.json" ] || die "fixture not found: $FIX/issue-$1.json"
}

normalize_fixture() {
  jq -c '{number,title,state,labels:(.labels // []),body:(.body // ""),parent:(.parent // null),blocked_by:(.blocked_by // []),children:(.children // [])}' "$1"
}

gh_api_numbers() {
  gh api --paginate "$1" --jq '.[].number' 2>/dev/null | jq -sc '.' || echo '[]'
}

gh_parent() {
  gh api "repos/{owner}/{repo}/issues/$1/parent" --jq '.number' 2>/dev/null || echo null
}

links_json() {
  local n="$1"
  if [ -n "$FIX" ]; then
    require_fixture "$n"
    local f="$FIX/issue-$n.json"
    local blocks='[]' g
    for g in "$FIX"/issue-*.json; do
      [ -f "$g" ] || continue
      blocks="$(jq -c --argjson n "$n" --argjson cur "$blocks" \
        'if ((.blocked_by // []) | index($n)) then $cur + [.number] else $cur end' "$g")"
    done
    jq -c --argjson blocks "$blocks" \
      '{blocked_by:(.blocked_by // []),blocks:$blocks,parent:(.parent // null),children:(.children // [])}' "$f"
    return
  fi
  local bb bl ch pa
  bb="$(gh_api_numbers "repos/{owner}/{repo}/issues/$n/dependencies/blocked_by")"
  bl="$(gh_api_numbers "repos/{owner}/{repo}/issues/$n/dependencies/blocking")"
  ch="$(gh_api_numbers "repos/{owner}/{repo}/issues/$n/sub_issues")"
  pa="$(gh_parent "$n")"
  jq -nc --argjson bb "${bb:-[]}" --argjson bl "${bl:-[]}" --argjson ch "${ch:-[]}" --argjson pa "${pa:-null}" \
    '{blocked_by:$bb,blocks:$bl,parent:$pa,children:$ch}'
}

issue_id() { gh api "repos/{owner}/{repo}/issues/$1" --jq '.id'; }

case "$VERB" in
  get-issue)
    need_num "${1:-}"
    if [ -n "$FIX" ]; then
      require_fixture "$1"
      normalize_fixture "$FIX/issue-$1.json"
    else
      base="$(gh issue view "$1" --json number,title,state,labels,body \
        | jq -c '{number,title,state:(.state|ascii_downcase),labels:[.labels[].name],body}')" || die "gh issue view failed for #$1"
      lk="$(links_json "$1")"
      jq -nc --argjson b "$base" --argjson l "$lk" '$b + {parent:$l.parent,blocked_by:$l.blocked_by,children:$l.children}'
    fi
    ;;

  search)
    q="${1:-}"; [ -n "$q" ] || die "search: query required"
    if [ -n "$FIX" ]; then
      all='[]'
      for g in "$FIX"/issue-*.json; do
        [ -f "$g" ] || continue
        all="$(jq -c --argjson cur "$all" '$cur + [{number,title,state,labels:(.labels // [])}]' "$g")"
      done
      jq -nc --argjson all "$all" --arg q "$q" '
        ($q | split(" ") | map(select(length>0))) as $t
        | {results: [ $all[] | . as $i
            | select(all($t[];
                . as $w
                | if ($w|startswith("label:")) then ($i.labels | index($w[6:])) != null
                  elif ($w|startswith("state:")) then (($i.state|ascii_downcase) == ($w[6:]|ascii_downcase))
                  elif ($w|startswith("is:")) then (($i.state|ascii_downcase) == ($w[3:]|ascii_downcase))
                  else (($i.title|ascii_downcase) | contains($w|ascii_downcase)) end)) ]}'
    else
      gh issue list --search "$q" --state all --limit 100 --json number,title,state,labels \
        | jq -c '{results:[.[] | {number,title,state:(.state|ascii_downcase),labels:[.labels[].name]}]}' || die "gh search failed"
    fi
    ;;

  comment)
    need_num "${1:-}"; n="$1"; shift
    [ "${1:-}" = "--body-file" ] && [ -n "${2:-}" ] || die "comment: --body-file F required"
    [ -f "$2" ] || die "comment: body file not found: $2"
    if is_dry; then
      jq -nc --argjson n "$n" --arg f "$2" --arg b "$(head -c 500 "$2")" '{dry_run:true,verb:"comment",issue:$n,body_file:$f,body_preview:$b}'
    else
      gh issue comment "$n" --body-file "$2" >/dev/null || die "gh comment failed"
      jq -nc --argjson n "$n" '{ok:true,verb:"comment",issue:$n}'
    fi
    ;;

  transition)
    need_num "${1:-}"; n="$1"; st="${2:-}"
    printf '%s\n' "${STATES[@]}" | grep -qx -- "$st" || die "transition: state must be one of ${STATES[*]}"
    rm_labels=(); for s in "${STATES[@]}"; do [ "$s" = "$st" ] || rm_labels+=("$s"); done
    if is_dry; then
      jq -nc --argjson n "$n" --arg a "$st" --argjson r "$(printf '%s\n' "${rm_labels[@]}" | jq -R . | jq -sc .)" \
        '{dry_run:true,verb:"transition",issue:$n,add_label:$a,remove_labels:$r}'
    else
      args=(issue edit "$n" --add-label "$st")
      for r in "${rm_labels[@]}"; do args+=(--remove-label "$r"); done
      gh "${args[@]}" >/dev/null || die "gh transition failed"
      jq -nc --argjson n "$n" --arg a "$st" '{ok:true,verb:"transition",issue:$n,state:$a}'
    fi
    ;;

  create-link)
    need_num "${1:-}"; n="$1"
    [ "${2:-}" = "blocked-by" ] || die "create-link: usage create-link N blocked-by M"
    need_num "${3:-}"; m="$3"
    if is_dry; then
      jq -nc --argjson n "$n" --argjson m "$m" '{dry_run:true,verb:"create-link",issue:$n,blocked_by:$m}'
    else
      gh api -X POST "repos/{owner}/{repo}/issues/$n/dependencies/blocked_by" -F issue_id="$(issue_id "$m")" >/dev/null || die "gh create-link failed"
      jq -nc --argjson n "$n" --argjson m "$m" '{ok:true,verb:"create-link",issue:$n,blocked_by:$m}'
    fi
    ;;

  list-links)
    need_num "${1:-}"
    links_json "$1"
    ;;

  list-children)
    need_num "${1:-}"; n="$1"
    if [ -n "$FIX" ]; then
      require_fixture "$n"
      f="$FIX/issue-$n.json"
      out='[]'
      for c in $(jq -r '(.children // [])[]' "$f"); do
        if [ -f "$FIX/issue-$c.json" ]; then
          out="$(jq -c --argjson cur "$out" '$cur + [{number,title,state,labels:(.labels // [])}]' "$FIX/issue-$c.json")"
        else
          out="$(jq -c --argjson cur "$out" --argjson c "$c" '$cur + [{number:$c,title:null,state:null,labels:[]}]' <<<'null')"
        fi
      done
      jq -nc --argjson c "$out" '{children:$c}'
    else
      gh api --paginate "repos/{owner}/{repo}/issues/$n/sub_issues" \
        --jq '.[] | {number,title,state,labels:[.labels[].name]}' 2>/dev/null | jq -sc '{children:.}' || die "gh list-children failed"
    fi
    ;;

  edit-issue)
    need_num "${1:-}"; n="$1"; shift
    eargs=(issue edit "$n"); desc=()
    while [ $# -gt 0 ]; do
      case "$1" in
        --add-label|--remove-label|--title) [ -n "${2:-}" ] || die "edit-issue: $1 needs a value"; eargs+=("$1" "$2"); desc+=("$1=$2"); shift 2 ;;
        *) die "edit-issue: unknown option $1" ;;
      esac
    done
    [ ${#desc[@]} -gt 0 ] || die "edit-issue: nothing to change"
    if is_dry; then
      jq -nc --argjson n "$n" --argjson d "$(printf '%s\n' "${desc[@]}" | jq -R . | jq -sc .)" '{dry_run:true,verb:"edit-issue",issue:$n,changes:$d}'
    else
      gh "${eargs[@]}" >/dev/null || die "gh edit-issue failed"
      jq -nc --argjson n "$n" '{ok:true,verb:"edit-issue",issue:$n}'
    fi
    ;;

  assign)
    need_num "${1:-}"; n="$1"; who="${2:-}"
    [ "$who" = "@me" ] || die "assign: only @me is supported"
    if is_dry; then
      jq -nc --argjson n "$n" '{dry_run:true,verb:"assign",issue:$n,assignee:"@me"}'
    else
      gh issue edit "$n" --add-assignee @me >/dev/null || die "gh assign failed"
      jq -nc --argjson n "$n" '{ok:true,verb:"assign",issue:$n,assignee:"@me"}'
    fi
    ;;

  create-issue)
    title=""; bf=""; parent=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --title) title="${2:-}"; shift 2 ;;
        --body-file) bf="${2:-}"; shift 2 ;;
        --parent) parent="${2:-}"; shift 2 ;;
        *) die "create-issue: unknown option $1" ;;
      esac
    done
    [ -n "$title" ] && [ -n "$bf" ] || die "create-issue: --title and --body-file required"
    [ -f "$bf" ] || die "create-issue: body file not found: $bf"
    [ -z "$parent" ] || need_num "$parent"
    if is_dry; then
      jq -nc --arg t "$title" --arg f "$bf" --arg p "$parent" \
        '{dry_run:true,verb:"create-issue",title:$t,body_file:$f,parent:(if $p=="" then null else ($p|tonumber) end)}'
    else
      url="$(gh issue create --title "$title" --body-file "$bf")" || die "gh create-issue failed"
      num="${url##*/}"
      if [ -n "$parent" ]; then
        gh api -X POST "repos/{owner}/{repo}/issues/$parent/sub_issues" -F sub_issue_id="$(issue_id "$num")" >/dev/null || die "created #$num but linking to parent #$parent failed"
      fi
      jq -nc --argjson n "$num" --arg u "$url" --arg p "$parent" \
        '{ok:true,verb:"create-issue",issue:$n,url:$u,parent:(if $p=="" then null else ($p|tonumber) end)}'
    fi
    ;;

  close-issue)
    need_num "${1:-}"; n="$1"
    [ "${EDU_ORCHESTRATED:-}" != "1" ] || die "close-issue is human-only: refused while EDU_ORCHESTRATED=1" 3
    if is_dry; then
      jq -nc --argjson n "$n" --argjson r "$(printf '%s\n' "${STATES[@]}" | jq -R . | jq -sc .)" \
        '{dry_run:true,verb:"close-issue",issue:$n,remove_labels:$r,hint:"human-only; pass --yes to close"}'
    else
      gh issue close "$n" >/dev/null || die "gh close failed"
      # A closed issue is done, so none of the in-flight status labels may stay on it.
      args=(issue edit "$n")
      while IFS= read -r l; do
        printf '%s\n' "${STATES[@]}" | grep -qx -- "$l" && args+=(--remove-label "$l")
      done < <(gh issue view "$n" --json labels --jq '.labels[].name')
      [ "${#args[@]}" -eq 3 ] || gh "${args[@]}" >/dev/null || die "gh label cleanup failed"
      jq -nc --argjson n "$n" '{ok:true,verb:"close-issue",issue:$n}'
    fi
    ;;

  *) die "unknown verb: $VERB" ;;
esac
