import { MEMBER_ROLE, OWNER_ROLE, STARTER_ROLES } from '@eduvault/policy';

const NO_ROLES = 'Member, no roles';

/** `member` is the baseline everyone holds, so it is never listed. */
export const listedRoles = (roles: readonly string[]): string[] =>
  roles.filter((role) => role !== MEMBER_ROLE);

export function roleLabel(slug: string): string {
  if (slug === OWNER_ROLE) {
    return 'Owner';
  }
  return STARTER_ROLES.find((role) => role.slug === slug)?.label ?? slug;
}

export function rolesLabel(roles: readonly string[]): string {
  const listed = listedRoles(roles);
  return listed.length === 0
    ? NO_ROLES
    : listed.map((role) => roleLabel(role)).join(', ');
}
