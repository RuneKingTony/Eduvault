import type { Role, RoleHolder } from '@eduvault/api-contract';
import {
  ALL_PERMISSIONS,
  STARTER_ROLES,
  toPermissionMap,
  type Permission,
} from '@eduvault/policy';

export const holder = (
  name: string,
  roles: string[] = ['member']
): RoleHolder => ({
  memberId: `m-${name.toLowerCase().replaceAll(' ', '-')}`,
  name,
  roles,
});

export const role = (
  slug: string,
  overrides: Partial<Role> & { held?: readonly Permission[] } = {}
): Role => {
  const { held, ...rest } = overrides;
  return {
    slug,
    label: slug.charAt(0).toUpperCase() + slug.slice(1),
    description: `About ${slug}`,
    source: 'custom',
    permissions: toPermissionMap(held ?? []),
    holderCount: 0,
    holders: [],
    editable: true,
    ...rest,
  };
};

const starter = (slug: string): Role => {
  const found = STARTER_ROLES.find((candidate) => candidate.slug === slug);
  return role(slug, {
    label: found?.label ?? slug,
    description: found?.description ?? null,
    source: 'starter',
    held: found?.permissions ?? [],
  });
};

export const OWNER_ROLE_ENTRY = role('owner', {
  label: 'Owner',
  description:
    'Every action, including ones added later. Set only by a super admin or another owner.',
  source: 'code',
  held: ALL_PERMISSIONS,
  editable: false,
});

export const MEMBER_ROLE_ENTRY = role('member', {
  label: 'Member',
  description: 'Everyone added starts here. Being added grants nothing.',
  source: 'code',
  editable: false,
});

export const ROLE_LIST: Role[] = [
  OWNER_ROLE_ENTRY,
  MEMBER_ROLE_ENTRY,
  ...STARTER_ROLES.map((entry) => starter(entry.slug)),
];

export const roleListResponse = (items: Role[] = ROLE_LIST) => ({ items });
