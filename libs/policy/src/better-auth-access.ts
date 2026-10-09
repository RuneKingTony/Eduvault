import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/organization/access';
import { statements } from './statements';

// PURE markers keep better-auth out of the SPA bundles that import this lib.
const betterAuthStatements = { ...defaultStatements, ...statements } as const;

export const betterAuthAc =
  /* @__PURE__ */ createAccessControl(betterAuthStatements);

export const betterAuthRoles = {
  owner: /* @__PURE__ */ betterAuthAc.newRole(betterAuthStatements),
  member: /* @__PURE__ */ betterAuthAc.newRole({}),
};
