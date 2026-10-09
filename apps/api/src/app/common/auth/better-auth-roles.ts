/** Better Auth types a member's role as its built-in names; any `organizationRole` slug is valid. */
export const castToBetterAuthRoles = (roles: readonly string[]) =>
  roles as ('owner' | 'member')[];
