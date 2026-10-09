#!/usr/bin/env bash
# Sourced by stack-worktree.sh and its offline tests.
# sweep_match <tree>  reads `pid command` lines (ps -axo pid=,command=) on stdin and prints the pids of the
# stack processes whose command line names a path under <tree>: the API bundle and vite dev servers started
# with --strictPort. A build, a test run or an editor in the same worktree never matches.
sweep_match() {
  awk -v tree="${1%/}/" -v self="$$" '
    $1 == self || $2 ~ /awk$/ { next }
    index($0, tree) == 0 { next }
    $0 ~ /dist\/main\.cjs/ { print $1; next }
    $0 ~ /vite/ && $0 ~ /--strictPort/ { print $1 }'
}
