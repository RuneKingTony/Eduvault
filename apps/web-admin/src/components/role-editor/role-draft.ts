import type { Role } from '@eduvault/api-contract';
import { countOf } from '@eduvault/shared';
import {
  capSummary,
  toPermissions,
  type Permission,
  type PermissionMap,
} from '@eduvault/policy';

export interface RoleDraft {
  label: string;
  description: string;
  permissions: PermissionMap;
}

export const EMPTY_DRAFT: RoleDraft = {
  label: '',
  description: '',
  permissions: {},
};

export const draftOf = (role: Role): RoleDraft => ({
  label: role.label,
  description: role.description ?? '',
  permissions: role.permissions,
});

const permissionSet = (map: PermissionMap): Set<Permission> =>
  new Set(toPermissions(map));

function samePermissions(a: PermissionMap, b: PermissionMap): boolean {
  const first = permissionSet(a);
  const second = permissionSet(b);
  return (
    first.size === second.size &&
    [...first].every((permission) => second.has(permission))
  );
}

export const sameDraft = (a: RoleDraft, b: RoleDraft): boolean =>
  a.label.trim() === b.label.trim() &&
  a.description.trim() === b.description.trim() &&
  samePermissions(a.permissions, b.permissions);

export const draftBody = (draft: RoleDraft) => ({
  label: draft.label.trim(),
  description:
    draft.description.trim() === '' ? null : draft.description.trim(),
  permissions: draft.permissions,
});

export const thingsSwitchedOn = (permissions: PermissionMap): number =>
  capSummary(permissions).length;

export const switchedOnText = (count: number): string => {
  if (count === 0) {
    return 'Nothing switched on';
  }
  return `${countOf(count, 'thing', 'things')} switched on`;
};
