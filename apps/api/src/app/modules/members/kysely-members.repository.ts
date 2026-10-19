import { Inject, Injectable } from '@nestjs/common';
import { sql, type ExpressionBuilder, type RawBuilder } from 'kysely';
import {
  DEFAULT_MEMBER_TITLE,
  MEMBER_PAGE_SIZE,
  type SchoolRoleEntry,
  type TaughtClass,
} from '@eduvault/api-contract';
import {
  OWNER_ROLE,
  PORTAL_ROLES,
  parsePermissionMap,
  splitRoles,
  PORTAL_SAFE_ROLES,
} from '@eduvault/policy';
import { Clock } from '../../common/clock';
import { campusIdsByUser } from '../../common/db/campus-ids-by-user';
import { escapeLike } from '../../common/db/escape-like';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import type { DB } from '../../../db/db-types';
import {
  MembersRepository,
  type MemberListQuery,
  type MemberRecord,
} from './members.repository';
import type { CampusClassScope } from '../../common/scope';

interface Teacher {
  organizationId: string;
  userId: string;
}

const classTeacherArms = (
  eb: ExpressionBuilder<DB, 'class_arm'>,
  { organizationId, userId }: Teacher
) =>
  eb
    .selectFrom('class_arm_teacher')
    .innerJoin('term', (join) =>
      join
        .onRef('term.session_id', '=', 'class_arm_teacher.session_id')
        .onRef('term.organization_id', '=', 'class_arm_teacher.organization_id')
    )
    .where('class_arm_teacher.organization_id', '=', organizationId)
    .where('class_arm_teacher.user_id', '=', userId)
    .where('term.is_current', '=', true)
    .select('class_arm_teacher.class_arm_id as class_arm_id');

/** The same arms `listTaughtClassIds` counts: the subject must still be on the arm's level. */
const subjectTeacherArms = (
  eb: ExpressionBuilder<DB, 'class_arm'>,
  { organizationId, userId }: Teacher
) =>
  eb
    .selectFrom('subject_teacher')
    .innerJoin('term', (join) =>
      join
        .onRef('term.id', '=', 'subject_teacher.term_id')
        .onRef('term.organization_id', '=', 'subject_teacher.organization_id')
    )
    .innerJoin('class_arm as subject_arm', (join) =>
      join
        .onRef('subject_arm.id', '=', 'subject_teacher.class_arm_id')
        .onRef(
          'subject_arm.organization_id',
          '=',
          'subject_teacher.organization_id'
        )
    )
    .innerJoin('level_subject', (join) =>
      join
        .onRef(
          'level_subject.class_level_id',
          '=',
          'subject_arm.class_level_id'
        )
        .onRef('level_subject.subject_id', '=', 'subject_teacher.subject_id')
        .onRef(
          'level_subject.organization_id',
          '=',
          'subject_teacher.organization_id'
        )
    )
    .where('subject_teacher.organization_id', '=', organizationId)
    .where('subject_teacher.user_id', '=', userId)
    .where('term.is_current', '=', true)
    .select('subject_teacher.class_arm_id as class_arm_id');

interface Row {
  id: string;
  userId: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
}

const toMemberSummary = (
  row: Row,
  extras: { campusIds: string[]; onLeave: boolean }
): MemberRecord => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  email: row.email,
  username: null,
  title: row.title ?? DEFAULT_MEMBER_TITLE,
  roles: splitRoles(row.role),
  ...extras,
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
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly clock: Clock
  ) {
    super();
  }

  private async onLeaveToday(
    organizationId: string,
    userIds: readonly string[]
  ): Promise<Set<string>> {
    if (userIds.length === 0) {
      return new Set();
    }
    const today = this.clock.today();
    const rows = await this.db
      .selectFrom('staff_leave')
      .select('created_by')
      .where('organization_id', '=', organizationId)
      .where('created_by', 'in', [...userIds])
      .where('status', '=', 'approved')
      .where(sql<boolean>`${today}::date BETWEEN starts_on AND ends_on`)
      .execute();
    return new Set(rows.map((row) => row.created_by));
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

  private async withCampuses(
    organizationId: string,
    rows: Row[]
  ): Promise<MemberRecord[]> {
    const userIds = rows.map((row) => row.userId);
    const [campuses, onLeave] = await Promise.all([
      campusIdsByUser(this.db, organizationId, userIds),
      this.onLeaveToday(organizationId, userIds),
    ]);
    return rows.map((row) =>
      toMemberSummary(row, {
        campusIds: campuses.get(row.userId) ?? [],
        onLeave: onLeave.has(row.userId),
      })
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

  async taughtClasses(
    organizationId: string,
    userId: string,
    viewer: CampusClassScope
  ): Promise<TaughtClass[]> {
    const rows = await this.db
      .selectFrom('class_arm')
      .innerJoin('class_level', (join) =>
        join
          .onRef('class_level.id', '=', 'class_arm.class_level_id')
          .onRef(
            'class_level.organization_id',
            '=',
            'class_arm.organization_id'
          )
      )
      .where('class_arm.organization_id', '=', organizationId)
      .where('class_arm.retired_at', 'is', null)
      .where('class_arm.id', 'in', (eb) =>
        classTeacherArms(eb, { organizationId, userId }).union(
          subjectTeacherArms(eb, { organizationId, userId })
        )
      )
      .where((eb) =>
        inCampusScope(eb, 'class_arm.campus_id', { scope: viewer.campusScope })
      )
      .where((eb) =>
        inCampusScope(eb, 'class_arm.id', { scope: viewer.classScope })
      )
      .select([
        'class_arm.id',
        'class_arm.name',
        'class_level.name as level_name',
      ])
      .orderBy('class_level.sequence')
      .orderBy('class_arm.name')
      .orderBy('class_arm.id')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      displayName: `${row.level_name} ${row.name}`,
    }));
  }
}
