# Sourced: exports E2E_*_URL from the launcher's var/eduvault-dev.env when present. Variables already set win.
# A launcher that runs the stack off the default ports records its URLs here (main checkout's var/,
# found through the git common dir so worktrees see it). Variables already set win.
STACK_ENV="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/../var/eduvault-dev.env"
if [ -f "$STACK_ENV" ]; then
  while IFS='=' read -r k v; do
    case "$k" in E2E_API_URL | E2E_ADMIN_URL | E2E_PORTAL_URL) [ -n "${!k:-}" ] || export "$k=$v" ;; esac
  done <"$STACK_ENV"
fi
