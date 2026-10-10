import { CAP_AREAS, type CapArea, type CapLevel } from './cap-areas';
import { PORTAL_ROLES } from './members';
import {
  MEMBER_ROLE,
  OWNER_ROLE,
  holds,
  toPermissionMap,
  toPermissions,
} from './roles';
import {
  ALL_PERMISSIONS,
  permLabel,
  type Action,
  type Permission,
  type PermissionMap,
  type Resource,
} from './statements';

export const MAX_ROLES_PER_SCHOOL = 50;
export const ROLE_LABEL_MAX = 40;
export const ROLE_DESCRIPTION_MAX = 200;
export const ROLE_SLUG_MIN = 2;
export const ROLE_SLUG_MAX = 40;

export const RESERVED_ROLE_SLUGS: readonly string[] = [
  OWNER_ROLE,
  MEMBER_ROLE,
  'admin',
  'new',
];

/** Admission assigns these, so a school can edit them but never delete them. */
export const PROTECTED_ROLES: readonly string[] = PORTAL_ROLES;

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function isValidRoleSlug(slug: string): boolean {
  return (
    slug.length >= ROLE_SLUG_MIN &&
    slug.length <= ROLE_SLUG_MAX &&
    SLUG_PATTERN.test(slug) &&
    !RESERVED_ROLE_SLUGS.includes(slug)
  );
}

function trimDashes(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === '-') {
    start++;
  }
  while (end > start && text[end - 1] === '-') {
    end--;
  }
  return text.slice(start, end);
}

export function deriveRoleSlug(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const free = (slug: string) =>
    !used.has(slug) && !RESERVED_ROLE_SLUGS.includes(slug);
  const cleaned = trimDashes(
    label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
  );
  const base =
    cleaned.length < ROLE_SLUG_MIN
      ? 'role'
      : trimDashes(cleaned.slice(0, ROLE_SLUG_MAX));
  if (free(base)) {
    return base;
  }
  for (let attempt = 2; ; attempt++) {
    const suffix = `-${attempt}`;
    const candidate = `${trimDashes(base.slice(0, ROLE_SLUG_MAX - suffix.length))}${suffix}`;
    if (free(candidate)) {
      return candidate;
    }
  }
}

const listed: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

/** The contract accepts any listed action on any listed resource, so pairs can still be unknown. */
export function unknownPermissions(map: PermissionMap): string[] {
  return Object.entries(map).flatMap(([resource, actions]) =>
    actions
      .map((action) => `${resource}:${action}`)
      .filter((permission) => !listed.has(permission))
  );
}

export function missingPermissions(
  roleMap: PermissionMap,
  editorMap: PermissionMap
): Permission[] {
  return toPermissions(roleMap).filter(
    (permission) => !holds(editorMap, permission)
  );
}

export interface RoleEditCheck {
  slug: string;
  rolePermissions: PermissionMap;
  editorPermissions: PermissionMap;
  isNew: boolean;
}

export function isRoleEditable({
  slug,
  rolePermissions,
  editorPermissions,
  isNew,
}: RoleEditCheck): boolean {
  if (slug === OWNER_ROLE || slug === MEMBER_ROLE) {
    return false;
  }
  return (
    holds(editorPermissions, isNew ? 'ac:create' : 'ac:update') &&
    missingPermissions(rolePermissions, editorPermissions).length === 0
  );
}

export interface CopiedPermissions {
  kept: PermissionMap;
  skipped: Permission[];
}

export function copyRolePermissions(
  source: PermissionMap,
  editorMap: PermissionMap
): CopiedPermissions {
  const wanted = toPermissions(source);
  return {
    kept: toPermissionMap(
      wanted.filter((permission) => holds(editorMap, permission))
    ),
    skipped: missingPermissions(source, editorMap),
  };
}

export type AreaLevel = Exclude<CapLevel, 'custom'>;

export interface LevelChange {
  map: PermissionMap;
  area: CapArea;
  level: AreaLevel;
  editorMap: PermissionMap;
}

export interface AppliedLevel {
  map: PermissionMap;
  leftOut: Permission[];
}

const levelPermissions = (
  area: CapArea,
  level: AreaLevel
): readonly Permission[] => {
  switch (level) {
    case 'none': {
      return [];
    }
    case 'see': {
      return area.see;
    }
    case 'change': {
      return [...area.see, ...area.change];
    }
  }
};

export function applyAreaLevel({
  map,
  area,
  level,
  editorMap,
}: LevelChange): AppliedLevel {
  const replaced = new Set<Permission>([
    ...area.see,
    ...area.change,
    ...(level === 'none'
      ? area.extras.flatMap((extra) => extra.permissions)
      : []),
  ]);
  const wanted = levelPermissions(area, level);
  const granted = wanted.filter((permission) => holds(editorMap, permission));
  const kept = toPermissions(map).filter(
    (permission) => !replaced.has(permission)
  );
  return {
    map: toPermissionMap(toPermissions(toPermissionMap([...kept, ...granted]))),
    leftOut: wanted.filter((permission) => !holds(editorMap, permission)),
  };
}

export type Pillar = 'People and access' | 'Foundation' | 'Finance';

export const FIRST_PILLAR: Pillar = 'People and access';

export const PILLARS: readonly Pillar[] = [
  FIRST_PILLAR,
  'Foundation',
  'Finance',
];

export const RESOURCE_PILLARS: Record<Resource, Pillar> = {
  team: 'People and access',
  campus: 'People and access',
  member: 'People and access',
  ac: 'People and access',
  schoolAccount: 'Foundation',
  student: 'Foundation',
  feeSchedule: 'Finance',
};

export const ACTION_WORDS: Record<Action, string> = {
  create: 'add',
  read: 'see',
  readAll: 'see all',
  update: 'change',
  delete: 'remove',
};

export function capabilityLabel(permission: Permission): string {
  for (const area of CAP_AREAS) {
    if (area.see.includes(permission) || area.change.includes(permission)) {
      return area.label;
    }
    const extra = area.extras.find((candidate) =>
      candidate.permissions.includes(permission)
    );
    if (extra !== undefined) {
      return extra.label;
    }
  }
  return permLabel(permission);
}

export const capabilityLabels = (
  permissions: readonly Permission[]
): string[] => [
  ...new Set(permissions.map((permission) => capabilityLabel(permission))),
];
