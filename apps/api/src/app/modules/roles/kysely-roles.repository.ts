import { Inject, Injectable } from '@nestjs/common';
import { parsePermissionMap, splitRoles } from '@eduvault/policy';
import { campusIdsByUser } from '../../common/db/campus-ids-by-user';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  RolesRepository,
  type RoleMemberRecord,
  type RoleRecord,
} from './roles.repository';

interface RoleRow {
  role: string;
  permission: string;
  label: string | null;
  description: string | null;
  source: string | null;
  createdAt: Date;
}

const toRole = (row: RoleRow): RoleRecord => ({
  slug: row.role,
  label: row.label ?? row.role,
  description: row.description,
  source: row.source === 'starter' ? 'starter' : 'custom',
  permissions: parsePermissionMap(row.permission),
  createdAt: row.createdAt,
});

@Injectable()
export class KyselyRolesRepository extends RolesRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async listRoles(organizationId: string): Promise<RoleRecord[]> {
    const rows = await this.db
      .selectFrom('organizationRole')
      .where('organizationId', '=', organizationId)
      .select([
        'role',
        'permission',
        'label',
        'description',
        'source',
        'createdAt',
      ])
      .orderBy('createdAt')
      .orderBy('role')
      .execute();
    return rows.map((row) => toRole(row));
  }

  async listMembers(organizationId: string): Promise<RoleMemberRecord[]> {
    const [rows, campusIds] = await Promise.all([
      this.db
        .selectFrom('member')
        .innerJoin('user', 'user.id', 'member.userId')
        .where('member.organizationId', '=', organizationId)
        .select(['member.id', 'member.userId', 'member.role', 'user.name'])
        .orderBy('user.name')
        .orderBy('member.id')
        .execute(),
      campusIdsByUser(this.db, organizationId),
    ]);
    return rows.map((row) => ({
      memberId: row.id,
      name: row.name,
      roles: splitRoles(row.role),
      campusIds: campusIds.get(row.userId) ?? [],
    }));
  }
}
