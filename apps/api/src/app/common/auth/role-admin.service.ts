import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Pool } from 'pg';
import { DB_TOKEN } from '../db/tokens';
import { withSchoolLock } from '../db/with-school-lock';
import type { PermissionMap } from '@eduvault/policy';
import type { AppAuth } from './better-auth';

interface RoleKey {
  organizationId: string;
  slug: string;
}

interface NewRole extends RoleKey {
  label: string;
  description: string | null;
  permissions: PermissionMap;
}

interface RoleChanges {
  label?: string;
  description?: string | null;
  permissions?: PermissionMap;
}

const where = ({ organizationId, slug }: RoleKey) => [
  { field: 'organizationId', value: organizationId },
  { field: 'role', value: slug },
];

/**
 * Better Auth's role routes need a member session (an acting super admin has
 * none) and use a per-process cache, so writes go through its adapter instead.
 */
@Injectable()
export class RoleAdminService {
  constructor(
    private readonly authService: AuthService<AppAuth>,
    @Inject(DB_TOKEN) private readonly pool: Pool
  ) {}

  underSchoolLock<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    return withSchoolLock(this.pool, organizationId, fn);
  }

  async create(role: NewRole): Promise<void> {
    const { adapter } = await this.authService.instance.$context;
    await adapter.create({
      model: 'organizationRole',
      data: {
        organizationId: role.organizationId,
        role: role.slug,
        permission: JSON.stringify(role.permissions),
        label: role.label,
        description: role.description,
        source: 'custom',
        createdAt: new Date(),
      },
    });
  }

  async update(key: RoleKey, changes: RoleChanges): Promise<void> {
    const { adapter } = await this.authService.instance.$context;
    const now = new Date();
    await adapter.update({
      model: 'organizationRole',
      where: where(key),
      update: {
        ...(changes.label === undefined ? {} : { label: changes.label }),
        ...(changes.description === undefined
          ? {}
          : { description: changes.description }),
        ...(changes.permissions === undefined
          ? {}
          : { permission: JSON.stringify(changes.permissions) }),
        editedAt: now,
        updatedAt: now,
      },
    });
  }

  async remove(key: RoleKey): Promise<void> {
    const { adapter } = await this.authService.instance.$context;
    await adapter.delete({ model: 'organizationRole', where: where(key) });
  }
}
