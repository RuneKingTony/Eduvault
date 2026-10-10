import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import {
  DEFAULT_MEMBER_TITLE,
  MEMBER_PAGE_SIZE,
  type SchoolRoleEntry,
} from '@eduvault/api-contract';
import {
  OWNER_ROLE,
  PORTAL_ROLES,
  parsePermissionMap,
  splitRoles,
  PORTAL_SAFE_ROLES,
} from '@eduvault/policy';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  MembersRepository,
  type MemberListQuery,
  type MemberRecord,
} from './members.repository';

interface Row {
  id: string;
  userId: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
}

const toMemberSummary = (row: Row, campusIds: string[]): MemberRecord => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  email: row.email,
  username: null,
  title: row.title ?? DEFAULT_MEMBER_TITLE,
  roles: splitRoles(row.role),
  campusIds,
});

interface RoleRow {
  role: string;
  permission: string;
  label: string | null;
  description: string | null;
  source: string | null;
}

const toSchoolRoleEntry = (row: RoleRow): SchoolRoleEntry => ({
  slug: row.role,
  label: row.label ?? row.role,
  description: row.description,
  source: row.source === 'starter' ? 'starter' : 'custom',
  permissions: parsePermissionMap(row.permission),
});

const escapeLike = (text: string): string =>
  text.replaceAll(/[\\%_]/g, String.raw`\$&`);

const roleList = (): RawBuilder<string[]> =>
  sql<string[]>`string_to_array(member.role, ',')`;

const textArray = (values: readonly string[]): RawBuilder<string[]> =>
  sql<string[]>`ARRAY[${sql.join(values)}]::text[]`;

const MEMBER_COLUMNS = [
  'member.id',
  'member.userId',
  'member.title',
  'member.role',
  'user.name',
  'user.email',
] as const;

@Injectable()
export class KyselyMembersRepository extends MembersRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private filtered({ organizationId, scope, q, role }: MemberListQuery) {
    const portalRoles = textArray(PORTAL_ROLES);
    const portalSafe = textArray([...PORTAL_SAFE_ROLES]);
    const wantsPortal = role !== undefined && PORTAL_ROLES.includes(role);
    const pattern = q === undefined ? '' : `%${escapeLike(q)}%`;

    return this.db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .where('member.organizationId', '=', organizationId)
      .$if(!wantsPortal, (qb) =>
        qb.where(
          sql<boolean>`NOT (${roleList()} && ${portalRoles} AND ${roleList()} <@ ${portalSafe})`
        )
      )
      .$if(role !== undefined, (qb) =>
        qb.where(sql<boolean>`${role ?? ''} = ANY(${roleList()})`)
      )
      .$if(pattern !== '', (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('user.name', 'ilike', pattern),
            eb('member.title', 'ilike', pattern),
            eb('member.role', 'ilike', pattern),
            eb.exists(
              eb
                .selectFrom('organizationRole')
                .select('organizationRole.id')
                .whereRef(
                  'organizationRole.organizationId',
                  '=',
                  'member.organizationId'
                )
                .where(
                  sql<boolean>`"organizationRole".role = ANY(${roleList()})`
                )
                .where('organizationRole.label', 'ilike', pattern)
            ),
          ])
        )
      )
      .$if(scope !== 'all', (qb) =>
        qb.where((eb) =>
          eb.exists(
            eb
              .selectFrom('teamMember')
              .select('teamMember.id')
              .whereRef('teamMember.userId', '=', 'member.userId')
              .where((inner) =>
                inCampusScope(inner, 'teamMember.teamId', { scope })
              )
          )
        )
      );
  }

  private async campusIdsByUser(
    organizationId: string,
    userIds: string[]
  ): Promise<Map<string, string[]>> {
    const byUser = new Map<string, string[]>();
    if (userIds.length === 0) {
      return byUser;
    }
    const rows = await this.db
      .selectFrom('teamMember')
      .innerJoin('campus', 'campus.team_id', 'teamMember.teamId')
      .innerJoin('team', 'team.id', 'teamMember.teamId')
      .where('campus.organization_id', '=', organizationId)
      .where('teamMember.userId', 'in', userIds)
      .select(['teamMember.userId', 'teamMember.teamId'])
      .orderBy('team.name')
      .orderBy('team.id')
      .execute();
    for (const row of rows) {
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.teamId]);
    }
    return byUser;
  }

  private async withCampuses(
    organizationId: string,
    rows: Row[]
  ): Promise<MemberRecord[]> {
    const campuses = await this.campusIdsByUser(
      organizationId,
      rows.map((row) => row.userId)
    );
    return rows.map((row) =>
      toMemberSummary(row, campuses.get(row.userId) ?? [])
    );
  }

  private async withCampusesOne(
    organizationId: string,
    row: Row | undefined
  ): Promise<MemberRecord | undefined> {
    if (row === undefined) {
      return undefined;
    }
    const [record] = await this.withCampuses(organizationId, [row]);
    return record;
  }

  private selectRow(organizationId: string) {
    return this.db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .where('member.organizationId', '=', organizationId)
      .select(MEMBER_COLUMNS);
  }

  async list(
    query: MemberListQuery
  ): Promise<{ items: MemberRecord[]; total: number }> {
    const filtered = this.filtered(query);
    const [rows, count] = await Promise.all([
      filtered
        .select(MEMBER_COLUMNS)
        .orderBy('user.name')
        .orderBy('member.id')
        .limit(MEMBER_PAGE_SIZE)
        .offset((query.page - 1) * MEMBER_PAGE_SIZE)
        .execute(),
      filtered
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .executeTakeFirstOrThrow(),
    ]);
    return {
      items: await this.withCampuses(query.organizationId, rows),
      total: Number(count.count),
    };
  }

  async findById(
    organizationId: string,
    id: string
  ): Promise<MemberRecord | undefined> {
    const row = await this.selectRow(organizationId)
      .where('member.id', '=', id)
      .executeTakeFirst();
    return this.withCampusesOne(organizationId, row);
  }

  async findByUser(
    organizationId: string,
    userId: string
  ): Promise<MemberRecord | undefined> {
    const row = await this.selectRow(organizationId)
      .where('member.userId', '=', userId)
      .executeTakeFirst();
    return this.withCampusesOne(organizationId, row);
  }

  async updateTitle(
    organizationId: string,
    id: string,
    title: string
  ): Promise<void> {
    await this.db
      .updateTable('member')
      .set({ title })
      .where('member.organizationId', '=', organizationId)
      .where('member.id', '=', id)
      .execute();
  }

  async countOwners(organizationId: string): Promise<number> {
    const row = await this.db
      .selectFrom('member')
      .where('member.organizationId', '=', organizationId)
      .where(sql<boolean>`${OWNER_ROLE} = ANY(${roleList()})`)
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async belongsToOtherSchool(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('member')
      .where('member.userId', '=', userId)
      .where('member.organizationId', '<>', organizationId)
      .select('member.id')
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async listRoles(organizationId: string): Promise<SchoolRoleEntry[]> {
    const rows = await this.db
      .selectFrom('organizationRole')
      .where('organizationId', '=', organizationId)
      .select(['role', 'permission', 'label', 'description', 'source'])
      .execute();
    return rows.map((row) => toSchoolRoleEntry(row));
  }
}
