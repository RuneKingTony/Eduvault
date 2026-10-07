#!/bin/bash
# /ship's setup in one call: the normalised key, every absolute path the skill uses, the /spike that
# launched it (or null), the parallel cap and the orchestrating Claude pid (the watch pid for heartbeat.sh).
#
# usage: setup.sh <KEY>    KEY = EDU-<n> (any case, uppercased)
# exit:  0 {key, root, d, lock, w, r, parent_spike, cap, claude_pid}
#        1 usage (KEY missing or invalid)     2 not in Herdr (HERDR_ENV unset)
set -u
. "$(dirname "$0")/lib.sh"

K=${1:-}
[[ "$K" =~ ^[Ee][Dd][Uu]-[0-9]+$ ]] || { echo "usage: /ship EDU-<n> [--auto-decide|--unattended]"; exit 1; }
K=$(echo "$K" | tr '[:lower:]' '[:upper:]')
require_herdr

D=$(key_dir "$K")
read -r CAP _ < <(ship_cap)
jq -nc --arg k "$K" --arg root "$ROOT" --arg d "$D" --arg w "$W" --arg r "$(cd "$W/.." && pwd -P)/references" \
  --argjson ps "$(parent_spike "$K")" --argjson cap "$CAP" --arg pid "${CLAUDE_PID:-}" \
  '{key: $k, root: $root, d: $d, lock: ($d + "/.lock"), w: $w, r: $r, parent_spike: $ps, cap: $cap,
    claude_pid: ($pid | tonumber? // null)}'
