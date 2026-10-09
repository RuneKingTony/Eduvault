#!/usr/bin/env bash
# session-name.sh <run dir> <persona> — prints the playwright-cli session name for a persona of a run:
# ev-<2-letter persona code>-<sid>. 12 characters, inside playwright-cli's 17-character socket-path limit.
# Usage: playwright-cli -s="$(bash session-name.sh "$RUN_DIR" owner)" open
set -eu
DIR="${1:?run dir}"; P="${2:?persona}"
case "$P" in owner) c=ow ;; superadmin) c=su ;; admin) c=ad ;; teacher) c=te ;; student) c=st ;; foreign) c=fo ;; *) echo "unknown persona $P" >&2; exit 2 ;; esac
echo "ev-$c-$(cat "$DIR/sid")"
