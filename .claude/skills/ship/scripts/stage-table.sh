#!/bin/bash
# The markdown stage table, generated from effort.sh. Nothing else states a model or effort.
set -u
E=$(dirname "$0")/effort.sh
echo "| stage | model | effort | runs in | gated | why |"
echo "|---|---|---|---|---|---|"
bash "$E" --list | while IFS=$'\t' read -r stage model effort runs gated why; do
  echo "| $stage | $model | $effort | $runs | $gated | $why |"
done
