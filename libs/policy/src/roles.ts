import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, ownerAc } from 'better-auth/plugins/organization/access';
import { statements, type ActionOf, type Resource } from './statements';

export const ROLE_NAMES = ['owner', 'admin', 'teacher', 'student'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ac = createAccessControl(statements);

const full = ['create', 'read', 'update', 'delete'] as const;

export const roles = {
  owner: ac.newRole({
    ...ownerAc.statements,
    student: full,
    feeSchedule: full,
    schoolAccount: full,
  }),
  admin: ac.newRole({
    ...adminAc.statements,
    team: ['create', 'update', 'delete'],
    student: full,
    feeSchedule: full,
    schoolAccount: ['create', 'read', 'update'],
  }),
  teacher: ac.newRole({
    student: ['read'],
    feeSchedule: ['read'],
  }),
  student: ac.newRole({
    feeSchedule: ['read'],
  }),
} as const;

export const isRoleName = (value: string): value is RoleName =>
  (ROLE_NAMES as readonly string[]).includes(value);

/** Better Auth stores multiple roles as a comma-separated string. */
export function parseRoles(role: string | null | undefined): RoleName[] {
  return (role ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(isRoleName);
}

export function can<R extends Resource>(
  role: string | null | undefined,
  resource: R,
  action: ActionOf<R>
): boolean {
  return parseRoles(role).some((name) => {
    const granted = (
      roles[name].statements as Partial<Record<string, readonly string[]>>
    )[resource];
    return granted?.includes(action) ?? false;
  });
}

/** Roles that see every campus of the school; others see only their own. */
export const SCHOOL_WIDE_ROLES: readonly RoleName[] = ['owner', 'admin'];

export const seesAllCampuses = (role: string | null | undefined): boolean =>
  parseRoles(role).some((name) => SCHOOL_WIDE_ROLES.includes(name));
