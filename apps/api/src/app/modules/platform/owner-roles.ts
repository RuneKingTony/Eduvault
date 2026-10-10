import { OWNER_ROLE, SUPERSEDED_BY_OWNER } from '@eduvault/policy';

export const ownerRoles = (roles: readonly string[]): string[] => [
  ...roles.filter(
    (role) => role !== OWNER_ROLE && !SUPERSEDED_BY_OWNER.includes(role)
  ),
  OWNER_ROLE,
];
