import { can, type PermissionMap } from '@eduvault/policy';
import type { OrgContext } from './auth';

export type ClassScope = OrgContext['classScope'];

export const isClassScoped = (permissions: PermissionMap): boolean =>
  can(permissions, 'class', 'read') && !can(permissions, 'class', 'readAll');

export const computeClassScope = (
  permissions: PermissionMap,
  teacherClassIds: readonly string[]
): ClassScope => (isClassScoped(permissions) ? [...teacherClassIds] : 'all');
