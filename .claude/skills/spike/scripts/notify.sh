#!/bin/bash
# Tell the user something needs them even when nobody is watching the spike session: a macOS
# notification and, inside Herdr, a Herdr notification with its request sound. Never fails its caller.
#
# usage: notify.sh "<title>" "<message>"   SPIKE_NOTIFY=0 prints instead (tests)
# exit:  always 0; prints one line
TITLE=${1:-spike} MSG=${2:-}
if [ "${SPIKE_NOTIFY:-1}" = 0 ]; then echo "notify (off): $TITLE — $MSG"; exit 0; fi
# argv, not string interpolation: a quote in the message can't break the AppleScript
osascript -e 'on run argv' -e 'display notification (item 2 of argv) with title (item 1 of argv) sound name "Glass"' \
  -e 'end run' "$TITLE" "$MSG" >/dev/null 2>&1
command -v herdr >/dev/null 2>&1 && herdr notification show "$TITLE" --body "$MSG" --sound request >/dev/null 2>&1
echo "notified: $TITLE — $MSG"
exit 0
