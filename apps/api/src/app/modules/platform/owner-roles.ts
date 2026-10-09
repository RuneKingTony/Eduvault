import { OWNER_ROLE } from '@eduvault/policy';

const SUPERSEDED_BY_OWNER = new Set(['administrator', 'principal']);

export const ownerRoles = (roles: readonly string[]): string[] => [
  ...roles.filter(
    (role) => role !== OWNER_ROLE && !SUPERSEDED_BY_OWNER.has(role)
  ),
  OWNER_ROLE,
];
