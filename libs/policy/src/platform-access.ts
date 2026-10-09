import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';

// PURE markers keep better-auth out of the SPA bundles that import this lib.
export const platformAc =
  /* @__PURE__ */ createAccessControl(defaultStatements);

export const platformRoles = {
  superadmin: /* @__PURE__ */ platformAc.newRole({
    user: ['list', 'get', 'ban'],
    session: ['list', 'revoke'],
  }),
  user: /* @__PURE__ */ platformAc.newRole({ user: [], session: [] }),
};
