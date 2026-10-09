# shellcheck shell=bash
# Sourced: exports E2E_*_URL from the launcher's var/eduvault-dev.env when present. Variables already set win.
# A launcher that runs the stack off the default ports records its URLs here (main checkout's var/,
# found through the git common dir so worktrees see it). Variables already set win.
STACK_ENV="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/../var/eduvault-dev.env"
if [ -f "$STACK_ENV" ]; then
  while IFS='=' read -r k v; do
    case "$k" in E2E_API_URL | E2E_ADMIN_URL | E2E_PORTAL_URL) [ -n "${!k:-}" ] || export "$k=$v" ;; esac
  done <"$STACK_ENV"
fi

# The super admin a run provisions schools as. A worktree stack bootstraps it; on the shared
# stack it must exist already, for example the seed's admin@eduvault.test (password123).
export E2E_SUPERADMIN_EMAIL="${E2E_SUPERADMIN_EMAIL:-e2e-superadmin@eduvault.test}"
export E2E_SUPERADMIN_PASSWORD="${E2E_SUPERADMIN_PASSWORD:-e2e-password-123}"

# is_eduvault_api <url>: /health alone answers {"status":"ok"} on other projects' APIs too, so also require
# Eduvault's own 401 body from the session guard on an unauthenticated /me.
is_eduvault_api() {
  local u="${1%/}" out
  [ "$(curl -s -m 3 "$u/health" 2>/dev/null | jq -r '.status // empty' 2>/dev/null)" = ok ] || return 1
  out=$(curl -s -m 3 -w '\n%{http_code}' "$u/me" 2>/dev/null) || return 1
  [ "${out##*$'\n'}" = 401 ] && grep -q 'Authentication is required' <<<"$out"
}
