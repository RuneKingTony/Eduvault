import { copyRolePermissions, type CopiedPermissions } from './role-editor';
import { toPermissionMap } from './roles';
import {
  ALL_PERMISSIONS,
  type Permission,
  type PermissionMap,
} from './statements';

export interface RoleTemplate {
  key: string;
  label: string;
  description: string;
  icon: 'badge-check' | 'building-2';
  permissions: readonly Permission[];
}

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'fees-approver',
    label: 'Fees approver',
    description:
      'Approves refunds, write-offs and discounts; cannot record payments.',
    icon: 'badge-check',
    permissions: [
      'student:read',
      'invoice:read',
      'payment:read',
      'adjustment:read',
      'adjustment:approve',
    ],
  },
  {
    key: 'campus-head',
    label: 'Campus head',
    description: 'Everything for one campus except money approvals.',
    icon: 'building-2',
    permissions: [
      'student:read',
      'student:update',
      'class:read',
      'class:readAll',
      'class:assignTeacher',
      'enrollment:read',
      'enrollment:place',
      'guardian:read',
      'invoice:read',
      'payment:read',
    ],
  },
];

export function availableRoleTemplates(
  listed: readonly Permission[] = ALL_PERMISSIONS
): RoleTemplate[] {
  const known = new Set(listed);
  return ROLE_TEMPLATES.filter((template) =>
    template.permissions.every((permission) => known.has(permission))
  );
}

export interface AppliedRoleTemplate extends CopiedPermissions {
  label: string;
  description: string;
  slug: string;
}

export function applyRoleTemplate(
  template: RoleTemplate,
  editorMap: PermissionMap
): AppliedRoleTemplate {
  return {
    label: template.label,
    description: template.description,
    slug: template.key,
    ...copyRolePermissions(toPermissionMap(template.permissions), editorMap),
  };
}
