import type { PermissionMap } from '@eduvault/policy';

export interface RoleRecord {
  slug: string;
  label: string;
  description: string | null;
  source: 'starter' | 'custom';
  permissions: PermissionMap;
  createdAt: Date;
}

export interface RoleMemberRecord {
  memberId: string;
  name: string;
  roles: string[];
  campusIds: string[];
}

export abstract class RolesRepository {
  abstract listRoles(organizationId: string): Promise<RoleRecord[]>;

  abstract listMembers(organizationId: string): Promise<RoleMemberRecord[]>;
}
