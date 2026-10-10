export const statements = {
  team: ['read', 'create', 'update', 'delete'],
  campus: ['readAll'],
  schoolAccount: ['read', 'update', 'create', 'delete'],
  student: ['create', 'read', 'update'],
  feeSchedule: ['create', 'read', 'update', 'delete'],
  member: ['create', 'read', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
} as const;

export type Statements = typeof statements;
export type Resource = keyof Statements;
export type ActionOf<R extends Resource> = Statements[R][number];
export type Action = ActionOf<Resource>;

export type Permission = {
  [R in Resource]: `${R}:${ActionOf<R>}`;
}[Resource];

export type PermissionMap = Partial<Record<Resource, Action[]>>;

export const RESOURCES = Object.keys(statements) as [Resource, ...Resource[]];

export const ACTIONS = [
  ...new Set(RESOURCES.flatMap((resource) => statements[resource])),
] as [Action, ...Action[]];

export const ALL_PERMISSIONS: readonly Permission[] = RESOURCES.flatMap(
  (resource) =>
    statements[resource].map((action) => `${resource}:${action}` as Permission)
);

export function splitPermission(permission: Permission): [Resource, Action] {
  const [resource = '', action = ''] = permission.split(':');
  return [resource as Resource, action as Action];
}

export const SENSITIVE: readonly Permission[] = [
  'campus:readAll',
  'member:create',
  'member:delete',
  'ac:create',
  'ac:update',
  'ac:delete',
];

export const PERM_HELP: Partial<Record<Permission, string>> = {
  'campus:readAll':
    'Sees every campus. Without it a member sees only the campuses they belong to.',
  'member:create': 'Adds people to the school. Owner-only by default.',
  'member:update':
    'Gives people roles, but only roles whose permissions they hold too.',
  'ac:create': 'Creates roles, using only what they can do themselves.',
};

const RESOURCE_LABELS: Record<Resource, string> = {
  team: 'Campuses',
  campus: 'Campus reach',
  schoolAccount: 'School settings',
  student: 'Students',
  feeSchedule: 'Fee schedules',
  member: 'Staff',
  ac: 'Roles',
};

export const resourceLabel = (resource: Resource): string =>
  RESOURCE_LABELS[resource];

export function permLabel(permission: Permission): string {
  const [resource, action] = splitPermission(permission);
  const words = action.replaceAll(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return `${RESOURCE_LABELS[resource]}: ${words}`;
}
