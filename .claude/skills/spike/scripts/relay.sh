#!/bin/bash
# Relay one question between the user and a ticket pane: --show prints what the pane is asking, --answer
# types the user's answer into it. A user-approved operation only: the orchestrator shows the user the
# question, and relays their exact words — it never answers for them.
#
# usage: relay.sh <EPIC> <KEY> --show
#        relay.sh <EPIC> <KEY> --answer "<text>"
#   --show    "<KEY> · pane <pane> · agent <name> · <status> · dialog|text", then the question: a dialog's
#             question and options, or the last thing the pane's Claude said; then "options: 1. … · 2. …"
#   --answer  dialog: an option number, or an option's exact label (any case), picks it; any other text goes
#             into its "Type something" option when it has one. text: typed at the prompt and submitted
# exit:  0 shown, or answered ("<KEY> answered in <pane>: <answer> · now <status>")
#        1 no pane recorded for <KEY>, or it is gone, or no Claude in it
#        2 usage, or the answer fits no option of the dialog (its options are printed), or the pane is on a
#          dialog with no numbered options (never answered blind: the user answers it in the pane)
#        12 nothing to answer: its Claude is working
#        15 the answer didn't land (the screen is printed)
set -u
. "$(dirname "$0")/lib.sh"

need_herdr
EPIC=$(norm_epic "${1:-}") || exit 2
KEY=$(norm_epic "${2:-}") || exit 2
MODE=${3:-} ANS=${4:-}
case "$MODE" in
  --show) ;;
  --answer) [ -n "$ANS" ] || { echo "usage: relay.sh <EPIC> <KEY> --answer \"<text>\""; exit 2; } ;;
  *) echo "usage: relay.sh <EPIC> <KEY> --show | --answer \"<text>\""; exit 2 ;;
esac
PANE=$(es_get "$EPIC" ".dispatched[\"$KEY\"].pane") AGENT=$(es_get "$EPIC" ".dispatched[\"$KEY\"].agent")
[ -n "$PANE" ] || { echo "$KEY was never dispatched in $EPIC — no pane to relay to"; exit 1; }
pane_gone "$PANE" && { echo "$KEY: pane $PANE is gone"; exit 1; }

astat() { local s; s=$(herdr agent get "$AGENT" 2>/dev/null | jq -r '.result.agent.agent_status // empty'); echo "${s:-gone}"; }
screen() {
  herdr pane read "$PANE" --source visible --lines 100 --format text 2>/dev/null |
    grep -v -E '^[[:space:]]*$|^[[:space:]]*[─━]{3,}|│.*●|manual mode on|bypass permissions|⏵⏵'
}
options() { grep -E "$OPT_RE" | sed -E 's/^[[:space:]]*(❯[[:space:]]*)?([0-9]+)\.[[:space:]]+/\2	/'; }   # N<tab>label
AS=$(astat) SCR=$(screen)
KIND=text
grep -qE "$OPT_RE" <<<"$SCR" && { [ "$AS" = blocked ] || grep -qE 'Enter to select|to navigate|Esc to cancel' <<<"$SCR"; } && KIND=dialog

if [ "$MODE" = --show ]; then
  echo "$KEY · pane $PANE · agent ${AGENT:-none} · $AS · $KIND"
  if [ "$KIND" = dialog ]; then
    first=$(grep -n -E "$OPT_RE" <<<"$SCR" | head -1 | cut -d: -f1)
    from=$(head -n "$first" <<<"$SCR" | grep -n -E '^[[:space:]]*[☐☒✔]' | tail -1 | cut -d: -f1)
    [ -n "$from" ] || from=$(( first > 3 ? first - 2 : 1 ))
    tail -n +"$from" <<<"$SCR" | grep -v -E 'Enter to select|to navigate|Esc to cancel'
    echo "options: $(options <<<"$SCR" | awk -F '\t' '{ printf "%s%s. %s", (NR > 1 ? " · " : ""), $1, $2 }')"
  else
    pane_text "$AGENT" "$PANE" "$AS" | awk '/^⏺/ { b = ""; f = 1 } f { b = b $0 "\n" } END { printf "%s", b }' | tail -25
  fi
  exit 0
fi

case "$AS" in working) echo "$KEY: its Claude is working — nothing to answer"; exit 12 ;; esac
logit() { echo "$(now_iso) $KEY relayed the user's answer to pane $PANE: $1" >> "$(epic_dir "$EPIC")/log.md"; }

if [ "$KIND" = dialog ]; then
  OPTS=$(options <<<"$SCR")
  if [[ "$ANS" =~ ^[0-9]+$ ]]; then N=$(awk -F '\t' -v n="$ANS" '$1 == n { print $1 }' <<<"$OPTS")
  else N=$(awk -F '\t' -v a="$(tr '[:upper:]' '[:lower:]' <<<"$ANS")" 'tolower($2) == a { print $1; exit }' <<<"$OPTS"); fi
  FREE=""
  if [ -z "$N" ] && [[ "$ANS" =~ ^[0-9]+$ ]]; then
    echo "$KEY: there is no option $ANS. Options:"; awk -F '\t' '{ print "  " $1 ". " $2 }' <<<"$OPTS"; exit 2
  fi
  if [ -z "$N" ]; then
    N=$(awk -F '\t' 'tolower($2) ~ /^type something/ { print $1; exit }' <<<"$OPTS") FREE=1
    [ -n "$N" ] || { echo "$KEY: \"$ANS\" is not an option, and this dialog takes no free text. Options:"
                     awk -F '\t' '{ print "  " $1 ". " $2 }' <<<"$OPTS"; exit 2; }
  fi
  label=$(awk -F '\t' -v n="$N" '$1 == n { print $2 }' <<<"$OPTS")
  [ -z "$FREE" ] && grep -qi '^type something' <<<"$label" &&
    { echo "$KEY: option $N takes free text — relay the user's words as the answer instead"; exit 2; }
  before=$(question_of dialog <<<"$SCR")
  # a digit selects that option and submits it in one key; past 9, walk the cursor there instead
  if [ "$N" -le 9 ]; then herdr pane send-keys "$PANE" "$N" >/dev/null 2>&1
  else
    cur=$(grep -E "$OPT_RE" <<<"$SCR" | grep -n '❯' | head -1 | cut -d: -f1)
    d=$(( N - ${cur:-1} )); k=down; [ $d -lt 0 ] && { k=up; d=$(( -d )); }
    for _ in $(seq 1 "$d"); do herdr pane send-keys "$PANE" "$k" >/dev/null 2>&1; done
    herdr pane send-keys "$PANE" enter >/dev/null 2>&1
  fi
  if [ -n "$FREE" ]; then
    sleep 1; herdr pane send-text "$PANE" "$ANS" >/dev/null 2>&1; sleep 0.5
    herdr pane send-keys "$PANE" enter >/dev/null 2>&1; label=$ANS
  fi
  for _ in $(seq 1 15); do
    sleep 1; AS=$(astat); SCR=$(screen)
    if ! grep -qE "$OPT_RE" <<<"$SCR" || [ "$(question_of dialog <<<"$SCR")" != "$before" ]; then
      logit "$label"; echo "$KEY answered in $PANE: $label · now $AS"; exit 0
    fi
  done
  echo "$KEY: the dialog in $PANE is still showing after the answer:"; tail -20 <<<"$SCR"; exit 15
fi

[ "$AS" = gone ] && { echo "$KEY: no Claude in pane $PANE to answer"; exit 1; }
[ "$AS" = blocked ] && { echo "$KEY: pane $PANE is on a dialog relay.sh doesn't recognise — answer it in the pane:"; tail -20 <<<"$SCR"; exit 2; }
# agent prompt appends to unsent input, so clear the box first
herdr pane send-keys "$PANE" ctrl+u >/dev/null 2>&1
if ! herdr agent prompt "$AGENT" "$ANS" --wait --until working --timeout 60000 >/dev/null 2>&1; then
  # typed but not submitted: submit once, only when the prompt line shows it
  herdr pane read "$PANE" --source visible --lines 15 --format text 2>/dev/null | grep '^❯' |
    grep -qF "$(printf '%s' "$ANS" | head -1 | cut -c1-30)" || { echo "$KEY: the answer didn't reach $PANE's prompt"; screen | tail -20; exit 15; }
  herdr pane send-keys "$PANE" enter >/dev/null 2>&1
  herdr agent wait "$AGENT" --until working --timeout 30000 >/dev/null 2>&1 ||
    { echo "$KEY: $PANE didn't start working on the answer"; screen | tail -20; exit 15; }
fi
logit "$ANS"; echo "$KEY answered in $PANE: $ANS · now $(astat)"
