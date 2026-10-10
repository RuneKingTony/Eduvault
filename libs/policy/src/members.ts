import { MEMBER_ROLE, OWNER_ROLE, holds, resolvePermissions } from './roles';
import type { PermissionMap } from './statements';

export const SENIOR_ROLES: readonly string[] = [
  OWNER_ROLE,
  'administrator',
  'principal',
];
export const SUPERSEDED_BY_OWNER: readonly string[] = SENIOR_ROLES.filter(
  (slug) => slug !== OWNER_ROLE
);
export const PORTAL_ROLES: readonly string[] = ['student', 'guardian'];

export const PORTAL_SAFE_ROLES: ReadonlySet<string> = new Set([
  MEMBER_ROLE,
  ...PORTAL_ROLES,
]);

const outsidePortal = (roles: readonly string[]): string[] =>
  roles.filter((slug) => !PORTAL_SAFE_ROLES.has(slug));

export function isPortalOnly(roles: readonly string[]): boolean {
  return (
    roles.some((slug) => PORTAL_ROLES.includes(slug)) &&
    outsidePortal(roles).length === 0
  );
}

export const permissionsOfRoles = (
  roles: readonly string[],
  catalogue: readonly { slug: string; permissions: PermissionMap }[]
): PermissionMap =>
  resolvePermissions(
    roles,
    Object.fromEntries(
      catalogue.map((entry) => [entry.slug, entry.permissions])
    )
  );

export const withMemberRole = (roles: readonly string[]): string[] => [
  MEMBER_ROLE,
  ...new Set(roles.filter((slug) => slug !== MEMBER_ROLE)),
];

export interface RoleDiff {
  added: string[];
  removed: string[];
}

export function roleDiff(
  current: readonly string[],
  draft: readonly string[]
): RoleDiff {
  const held = new Set(current.filter((slug) => slug !== MEMBER_ROLE));
  const wanted = new Set(draft.filter((slug) => slug !== MEMBER_ROLE));
  return {
    added: [...wanted].filter((slug) => !held.has(slug)),
    removed: [...held].filter((slug) => !wanted.has(slug)),
  };
}

export function needsCampusStep(permissions: PermissionMap): boolean {
  return !holds(permissions, 'campus:readAll');
}

export interface RoleComboCheck {
  current: readonly string[];
  draft: readonly string[];
  memberName: string;
  labelOf: (slug: string) => string;
}

export function validateRoleCombo(check: RoleComboCheck): string | undefined {
  const { current, draft, memberName, labelOf } = check;
  const seniors = SENIOR_ROLES.filter((slug) => draft.includes(slug));
  const [first, second] = seniors;
  if (first !== undefined && second !== undefined) {
    return `${labelOf(first)} and ${labelOf(second)} can’t be held by the same person. Choose one senior role.`;
  }
  const staffRoles = outsidePortal(draft).map((slug) => labelOf(slug));
  if (draft.includes('student') && staffRoles.length > 0) {
    return `A student can’t also hold staff roles (${staffRoles.join(', ')}).`;
  }
  if (isPortalOnly(current) && staffRoles.length > 0) {
    return `${memberName} is a portal user (student or guardian) and can’t be given ${staffRoles.join(', ')}.`;
  }
  return undefined;
}

export interface HandoverRoles {
  target: string[];
  caller: string[];
}

export function handoverRoles(
  targetRoles: readonly string[],
  callerRoles: readonly string[]
): HandoverRoles {
  return {
    target: withMemberRole([
      ...targetRoles.filter((slug) => !SUPERSEDED_BY_OWNER.includes(slug)),
      OWNER_ROLE,
    ]),
    caller: withMemberRole(callerRoles.filter((slug) => slug !== OWNER_ROLE)),
  };
}
