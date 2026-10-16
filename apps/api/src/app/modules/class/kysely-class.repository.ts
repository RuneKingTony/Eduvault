import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { classTeacherRoleSchema, type RosterRow } from '@eduvault/api-contract';
import { splitRoles, type PermissionMap } from '@eduvault/policy';
import { customRolePermissions } from '../../common/auth';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { isoOrNull } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { placedNow } from '../../common/students';
import {
  ClassRepository,
  type ClassFilter,
  type ClassTeacherKey,
  type ClassRecord,
  type ClassTeacherRecord,
  type LevelRecord,
  type NewClass,
  type NewClassTeacher,
  type NewLevel,
  type SchoolMemberRecord,
  type Visibility,
} from './class.repository';

interface LevelRow {
  id: string;
  code: string;
  name: string;
  sequence: number;
  next_level_id: string | null;
}

interface ClassRow {
  id: string;
  name: string;
  class_level_id: string;
  level_code: string;
  level_name: string;
  level_next_level_id: string | null;
  campus_id: string;
  campus_name: string;
  retired_at: Date | string | null;
}

const toLevel = (row: LevelRow): LevelRecord => ({
  id: row.id,
  code: row.code,
  name: row.name,
  sequence: row.sequence,
  nextLevelId: row.next_level_id,
});

const toClass = (row: ClassRow): ClassRecord => ({
  id: row.id,
  name: row.name,
  levelId: row.class_level_id,
  levelCode: row.level_code,
  levelName: row.level_name,
  levelNextLevelId: row.level_next_level_id,
  campusId: row.campus_id,
  campusName: row.campus_name,
  retiredAt: isoOrNull(row.retired_at),
});

const inClassScope = inCampusScope;

@Injectable()
export class KyselyClassRepository extends ClassRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private levels(organizationId: string) {
    return this.db
      .selectFrom('class_level')
      .where('class_level.organization_id', '=', organizationId)
      .select([
        'class_level.id',
        'class_level.code',
        'class_level.name',
        'class_level.sequence',
        'class_level.next_level_id',
      ]);
  }

  private classes(organizationId: string) {
    return this.db
      .selectFrom('class_arm')
      .innerJoin('class_level', 'class_level.id', 'class_arm.class_level_id')
      .innerJoin('team', 'team.id', 'class_arm.campus_id')
      .where('class_arm.organization_id', '=', organizationId)
      .select([
        'class_arm.id',
        'class_arm.name',
        'class_arm.class_level_id',
        'class_arm.campus_id',
        'class_arm.retired_at',
        'class_level.code as level_code',
        'class_level.name as level_name',
        'class_level.next_level_id as level_next_level_id',
        'team.name as campus_name',
      ]);
  }

  private visible(organizationId: string, visibility: Visibility) {
    return this.classes(organizationId)
      .where((eb) =>
        inCampusScope(eb, 'class_arm.campus_id', {
          scope: visibility.campusScope,
        })
      )
      .where((eb) =>
        inClassScope(eb, 'class_arm.id', { scope: visibility.classScope })
      );
  }

  async listLevels(organizationId: string): Promise<LevelRecord[]> {
    const rows = await this.levels(organizationId)
      .orderBy('class_level.sequence')
      .execute();
    return rows.map((row) => toLevel(row));
  }

  async findLevel(
    organizationId: string,
    id: string
  ): Promise<LevelRecord | undefined> {
    const row = await this.levels(organizationId)
      .where('class_level.id', '=', id)
      .executeTakeFirst();
    return row && toLevel(row);
  }

  async findLevelByCode(
    organizationId: string,
    code: string
  ): Promise<LevelRecord | undefined> {
    const row = await this.levels(organizationId)
      .where('class_level.code', '=', code)
      .executeTakeFirst();
    return row && toLevel(row);
  }

  async insertLevel(
    organizationId: string,
    input: NewLevel
  ): Promise<LevelRecord> {
    const row = await this.db
      .insertInto('class_level')
      .values({
        organization_id: organizationId,
        code: input.code,
        name: input.name,
        next_level_id: input.nextLevelId,
        sequence: sql<number>`(
          SELECT COALESCE(MAX(sequence), 0) + 1
          FROM class_level
          WHERE organization_id = ${organizationId}
        )`,
      })
      .returning(['id', 'code', 'name', 'sequence', 'next_level_id'])
      .executeTakeFirstOrThrow();
    return toLevel(row);
  }

  async updateLevel(
    organizationId: string,
    id: string,
    changes: { name?: string; nextLevelId?: string | null }
  ): Promise<void> {
    await this.db
      .updateTable('class_level')
      .set({
        ...(changes.name === undefined ? {} : { name: changes.name }),
        ...(changes.nextLevelId === undefined
          ? {}
          : { next_level_id: changes.nextLevelId }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async applyLevelOrder(
    organizationId: string,
    orderedIds: readonly string[]
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // The sequence unique is not deferrable: park every row on a free negative value first.
      await trx
        .updateTable('class_level')
        .set({ sequence: sql<number>`-sequence` })
        .where('organization_id', '=', organizationId)
        .execute();
      await sql`
        UPDATE class_level
        SET sequence = ordered.position::int, updated_at = NOW()
        FROM unnest(${[...orderedIds]}::uuid[]) WITH ORDINALITY AS ordered (id, position)
        WHERE class_level.id = ordered.id
          AND class_level.organization_id = ${organizationId}
      `.execute(trx);
    });
  }

  async listClasses(
    organizationId: string,
    filter: ClassFilter
  ): Promise<ClassRecord[]> {
    const rows = await this.visible(organizationId, filter)
      .$if(filter.campusId !== undefined, (qb) =>
        qb.where('class_arm.campus_id', '=', filter.campusId ?? '')
      )
      .$if(filter.levelId !== undefined, (qb) =>
        qb.where('class_arm.class_level_id', '=', filter.levelId ?? '')
      )
      .$if(filter.status === 'active', (qb) =>
        qb.where('class_arm.retired_at', 'is', null)
      )
      .$if(filter.status === 'archived', (qb) =>
        qb.where('class_arm.retired_at', 'is not', null)
      )
      .orderBy('class_level.sequence')
      .orderBy('team.name')
      .orderBy('class_arm.name')
      .orderBy('class_arm.id')
      .execute();
    return rows.map((row) => toClass(row));
  }

  async findClass(
    organizationId: string,
    id: string,
    visibility: Visibility
  ): Promise<ClassRecord | undefined> {
    const row = await this.visible(organizationId, visibility)
      .where('class_arm.id', '=', id)
      .executeTakeFirst();
    return row && toClass(row);
  }

  async findClassByName(
    organizationId: string,
    input: NewClass
  ): Promise<ClassRecord | undefined> {
    const row = await this.classes(organizationId)
      .where('class_arm.class_level_id', '=', input.levelId)
      .where('class_arm.campus_id', '=', input.campusId)
      .where('class_arm.name', '=', input.name)
      .executeTakeFirst();
    return row && toClass(row);
  }

  async insertClass(organizationId: string, input: NewClass): Promise<string> {
    const row = await this.db
      .insertInto('class_arm')
      .values({
        organization_id: organizationId,
        class_level_id: input.levelId,
        campus_id: input.campusId,
        name: input.name,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async renameClass(
    organizationId: string,
    id: string,
    name: string
  ): Promise<void> {
    await this.db
      .updateTable('class_arm')
      .set({ name, updated_at: new Date() })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async setRetired(
    organizationId: string,
    id: string,
    retiredBy: string | null
  ): Promise<void> {
    await this.db
      .updateTable('class_arm')
      .set({
        retired_at: retiredBy === null ? null : new Date(),
        retired_by: retiredBy,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async hasPlacementsFromCurrentTerm(
    organizationId: string,
    classId: string
  ): Promise<boolean> {
    const { rows } = await sql<{ placed: boolean }>`
      SELECT EXISTS (
        SELECT 1
        FROM enrollment_placement ep
        JOIN term t ON t.id = ep.term_id
        WHERE ep.organization_id = ${organizationId}
          AND ep.class_arm_id = ${classId}
          AND t.starts_on >= COALESCE(
            (SELECT c.starts_on FROM term c
             WHERE c.organization_id = ${organizationId} AND c.is_current),
            '-infinity'::date
          )
      ) AS placed`.execute(this.db);
    return rows[0]?.placed ?? false;
  }

  async studentCounts(
    organizationId: string,
    classIds: readonly string[]
  ): Promise<Record<string, number>> {
    if (classIds.length === 0) {
      return {};
    }
    const rows = await placedNow(this.db, organizationId)
      .where('ep.class_arm_id', 'in', [...classIds])
      .select(['ep.class_arm_id', (eb) => eb.fn.countAll<string>().as('total')])
      .groupBy('ep.class_arm_id')
      .execute();
    return Object.fromEntries(
      rows.map((row) => [row.class_arm_id, Number(row.total)])
    );
  }

  async roster(organizationId: string, classId: string): Promise<RosterRow[]> {
    const rows = await placedNow(this.db, organizationId)
      .where('ep.class_arm_id', '=', classId)
      .select([
        'student.id',
        'student.first_name',
        'student.last_name',
        'student.admission_number',
      ])
      .orderBy('student.last_name')
      .orderBy('student.first_name')
      .orderBy('student.id')
      .execute();
    return rows.map((row) => ({
      studentId: row.id,
      name: `${row.first_name} ${row.last_name}`,
      admissionNumber: row.admission_number,
    }));
  }

  async currentSessionId(organizationId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('term')
      .where('organization_id', '=', organizationId)
      .where('is_current', '=', true)
      .select('session_id')
      .executeTakeFirst();
    return row?.session_id ?? null;
  }

  async teachersOf(
    organizationId: string,
    classIds: readonly string[],
    sessionId: string
  ): Promise<ClassTeacherRecord[]> {
    if (classIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('class_arm_teacher')
      .innerJoin('user', 'user.id', 'class_arm_teacher.user_id')
      .where('class_arm_teacher.organization_id', '=', organizationId)
      .where('class_arm_teacher.session_id', '=', sessionId)
      .where('class_arm_teacher.class_arm_id', 'in', [...classIds])
      .select([
        'class_arm_teacher.class_arm_id',
        'class_arm_teacher.user_id',
        'class_arm_teacher.role',
        'user.name',
      ])
      .execute();
    return rows.map((row) => ({
      classId: row.class_arm_id,
      userId: row.user_id,
      name: row.name,
      role: classTeacherRoleSchema.parse(row.role),
    }));
  }

  async listMembers(
    organizationId: string,
    campusId: string
  ): Promise<SchoolMemberRecord[]> {
    const rows = await this.db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .leftJoin('teamMember', (join) =>
        join
          .onRef('teamMember.userId', '=', 'member.userId')
          .on('teamMember.teamId', '=', campusId)
      )
      .where('member.organizationId', '=', organizationId)
      .select([
        'member.userId',
        'member.role',
        'user.name',
        'teamMember.teamId',
      ])
      .orderBy('user.name')
      .orderBy('member.userId')
      .execute();
    return rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      roles: splitRoles(row.role),
      onCampus: row.teamId !== null,
    }));
  }

  async rolePermissions(
    organizationId: string
  ): Promise<Record<string, PermissionMap>> {
    const rows = await this.db
      .selectFrom('organizationRole')
      .where('organizationId', '=', organizationId)
      .select(['role', 'permission'])
      .execute();
    return customRolePermissions(rows);
  }

  async insertTeacher(
    organizationId: string,
    input: NewClassTeacher
  ): Promise<void> {
    await this.db
      .insertInto('class_arm_teacher')
      .values({
        organization_id: organizationId,
        class_arm_id: input.classId,
        session_id: input.sessionId,
        user_id: input.userId,
        role: input.role,
        created_by: input.createdBy,
      })
      .execute();
  }

  async deleteTeacher(
    organizationId: string,
    key: ClassTeacherKey
  ): Promise<boolean> {
    const result = await this.db
      .deleteFrom('class_arm_teacher')
      .where('organization_id', '=', organizationId)
      .where('class_arm_id', '=', key.classId)
      .where('session_id', '=', key.sessionId)
      .where('user_id', '=', key.userId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
