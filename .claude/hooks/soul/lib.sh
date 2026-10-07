#!/bin/bash
# Shared paths for the SOUL hooks. Sourced, never run.
# Runtime state (log, watermark, proposals) lives in the main checkout's .claude/soul/ so every
# worktree session shares one log. Reviewed policies live in the tracked seed dir of this checkout.
# SOUL_ROOT and SOUL_SEED override both (tests use them so the real state is never touched).

SOUL_HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SOUL_CHECKOUT="$(cd "$SOUL_HOOKS_DIR/../../.." && pwd -P)"
SOUL_MAIN_ROOT="$(git -C "$SOUL_CHECKOUT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
SOUL_MAIN_ROOT="${SOUL_MAIN_ROOT:+$(dirname "$SOUL_MAIN_ROOT")}"
SOUL_DIR="${SOUL_ROOT:-${SOUL_MAIN_ROOT:-$SOUL_CHECKOUT}/.claude/soul}"
SOUL_SEED="${SOUL_SEED:-$SOUL_CHECKOUT/.claude/soul/seed}"
SOUL_LOG="$SOUL_DIR/decisions.jsonl"
SOUL_WATERMARK="$SOUL_DIR/.last-distill"
SOUL_CONFIG="$SOUL_DIR/config.json"
SOUL_PROPOSALS="$SOUL_DIR/proposals"
SOUL_HEADERS="$SOUL_HOOKS_DIR/headers.json"

soul_config() {
  local v
  v=$(jq -r --arg k "$1" '.[$k] // empty' "$SOUL_CONFIG" 2>/dev/null)
  case "$v" in (''|*[!0-9]*) echo "$2";; (*) echo "$v";; esac
}

soul_watermark() {
  local n
  n=$(jq -r '.lines // empty' "$SOUL_WATERMARK" 2>/dev/null)
  case "$n" in (''|*[!0-9]*) echo 0;; (*) echo "$n";; esac
}

soul_log_lines() {
  if [ -f "$SOUL_LOG" ]; then wc -l < "$SOUL_LOG" | tr -d ' '; else echo 0; fi
}

soul_today() { echo "${SOUL_TODAY:-$(date +%F)}"; }
