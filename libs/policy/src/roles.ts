import {
  ALL_PERMISSIONS,
  RESOURCES,
  splitPermission,
  type ActionOf,
  type Permission,
  type PermissionMap,
  type Resource,
} from './statements';

export const OWNER_ROLE = 'owner';
export const MEMBER_ROLE = 'member';

export interface StarterRole {
  slug: string;
  label: string;
  description: string;
  permissions: readonly Permission[];
}

export const STARTER_ROLES: readonly StarterRole[] = [
  {
    slug: 'administrator',
    label: 'Administrator',
    description:
      'Runs the school day to day: calendar, classes, students and staff.',
    permissions: [
      'team:read',
      'team:create',
      'team:update',
      'campus:readAll',
      'schoolAccount:read',
      'student:create',
      'student:read',
      'student:update',
    ],
  },
  {
    slug: 'teacher',
    label: 'Teacher',
    description: 'Teaches their own classes. Sees only those classes.',
    permissions: ['student:read'],
  },
  {
    slug: 'bursar',
    label: 'Bursar',
    description:
      'Charges fees, records payments and asks for corrections. Cannot approve them.',
    permissions: ['student:read'],
  },
  {
    slug: 'principal',
    label: 'Principal',
    description: 'Approves money corrections across the school.',
    permissions: ['team:read', 'campus:readAll', 'student:read'],
  },
  {
    slug: 'student',
    label: 'Student',
    description: 'Portal only. Sees their own records.',
    permissions: [],
  },
  {
    slug: 'guardian',
    label: 'Guardian',
    description: 'Portal only. Sees their linked children.',
    permissions: [],
  },
];

export type Gate = readonly Permission[];

export const READ_PERMS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (permission) => {
    const [, action] = splitPermission(permission);
    return action === 'read' || action === 'readAll';
  }
);

export function toPermissionMap(
  permissions: readonly Permission[]
): PermissionMap {
  const map: PermissionMap = {};
  for (const permission of permissions) {
    const [resource, action] = splitPermission(permission);
    const actions = (map[resource] ??= []);
    if (!actions.includes(action)) {
      actions.push(action);
    }
  }
  return map;
}

export function toPermissions(map: PermissionMap): Permission[] {
  return RESOURCES.flatMap((resource) =>
    (map[resource] ?? []).map((action) => `${resource}:${action}` as Permission)
  );
}

/** Reads a Better Auth `permission` column, dropping anything not in the list. */
export function parsePermissionMap(json: string): PermissionMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }
  const listed = new Set<string>(ALL_PERMISSIONS);
  const held = Object.entries(parsed).flatMap(([resource, actions]) =>
    Array.isArray(actions)
      ? actions
          .map((action) => `${resource}:${String(action)}`)
          .filter((permission): permission is Permission =>
            listed.has(permission)
          )
      : []
  );
  return toPermissionMap(held);
}

/** `owner` and `member` live in code; every other role is an `organizationRole` row. */
const CODE_ROLES = new Map<string, readonly Permission[]>([
  [OWNER_ROLE, ALL_PERMISSIONS],
  [MEMBER_ROLE, []],
]);

export function resolvePermissions(
  roles: readonly string[],
  customRolePermissions: Readonly<Record<string, PermissionMap>>
): PermissionMap {
  const held = new Set<Permission>();
  for (const role of roles) {
    const custom = Object.hasOwn(customRolePermissions, role)
      ? customRolePermissions[role]
      : undefined;
    const granted = CODE_ROLES.get(role) ?? toPermissions(custom ?? {});
    for (const permission of granted) {
      held.add(permission);
    }
  }
  return toPermissionMap([...held]);
}

export function can<R extends Resource>(
  permissions: PermissionMap,
  resource: R,
  action: ActionOf<R>
): boolean {
  return permissions[resource]?.includes(action) ?? false;
}

export function canAny(permissions: PermissionMap, gate: Gate): boolean {
  return gate.some((permission) => {
    const [resource, action] = splitPermission(permission);
    return permissions[resource]?.includes(action) ?? false;
  });
}
