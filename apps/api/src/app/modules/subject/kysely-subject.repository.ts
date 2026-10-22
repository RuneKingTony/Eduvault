import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { levelSubjectKindSchema } from '@eduvault/api-contract';
import { Clock, schoolToday } from '../../common/clock';
import { currentSessionId } from '../../common/db/current-session';
import { isoOrNull } from '../../common/db/rows';
import { studentSubjectsOf } from '../../common/db/student-subjects';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { visibleStudentsCte } from '../../common/students';
import {
  SubjectRepository,
  type ArmSubjectRecord,
  type ElectiveLevelRecord,
  type ElectiveStudentQuery,
  type ElectiveStudentRecord,
  type ElectiveTakerRow,
  type ElectiveWrite,
  type LevelListRow,
  type LevelSubjectRecord,
  type NewSubject,
  type NewSubjectTeacher,
  type SessionRecord,
  type SubjectPage,
  type SubjectPaging,
  type SubjectRecord,
  type SubjectTeacherKey,
  type TakerCount,
  type TermAssignment,
  type TermRecord,
} from './subject.repository';
import type { CampusClassScope } from '../../common/scope';

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  retired_at: Date | string | null;
}

const toSubject = (
  row: SubjectRow,
  levelCodes: readonly string[]
): SubjectRecord => ({
  id: row.id,
  code: row.code,
  name: row.name,
  retiredAt: isoOrNull(row.retired_at),
  levelCodes: [...levelCodes],
});

const asUuid = (id: string) => sql`${id}::uuid`;

interface ElectiveStudentRow {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  enrollment_id: string | null;
  class_level_id: string | null;
  class_id: string | null;
  class_name: string | null;
}

interface ElectiveStudentsInput {
  organizationId: string;
  scope: CampusClassScope;
  today: string;
  query: ElectiveStudentQuery;
}

function electiveStudentsStatement({
  organizationId,
  scope,
  today,
  query,
}: ElectiveStudentsInput) {
  const { sessionId, studentIds } = query;
  const filter =
    studentIds === undefined
      ? sql`AND e.id IS NOT NULL AND EXISTS (
          SELECT 1 FROM level_subject ls
          WHERE ls.organization_id = visible.organization_id
            AND ls.class_level_id = e.class_level_id
            AND ls.kind = 'elective')`
      : sql`AND visible.id IN (${sql.join(studentIds.map((id) => asUuid(id)))})`;
  return sql<ElectiveStudentRow>`
    WITH ${visibleStudentsCte({ organizationId, ...scope, today })}
    SELECT
      visible.id,
      visible.first_name,
      visible.last_name,
      visible.admission_number,
      e.id AS enrollment_id,
      e.class_level_id,
      placed.class_arm_id AS class_id,
      placed.class_name
    FROM visible
    LEFT JOIN student_enrollment e
      ON e.student_id = visible.id
      AND e.organization_id = visible.organization_id
      AND e.session_id = ${sessionId}
      AND e.status = 'active'
    LEFT JOIN LATERAL (
      SELECT ep.class_arm_id, cl.name || ' ' || ca.name AS class_name
      FROM enrollment_placement ep
      JOIN term t ON t.id = ep.term_id AND t.organization_id = ep.organization_id
      JOIN class_arm ca ON ca.id = ep.class_arm_id AND ca.organization_id = ep.organization_id
      JOIN class_level cl ON cl.id = ca.class_level_id AND cl.organization_id = ca.organization_id
      WHERE ep.enrollment_id = e.id AND ep.organization_id = e.organization_id
      ORDER BY t.starts_on DESC
      LIMIT 1
    ) placed ON TRUE
    WHERE visible.archived_at IS NULL
      ${filter}
    ORDER BY visible.last_name, visible.first_name, visible.id`;
}

const subjectTeacherValues = (
  organizationId: string,
  input: NewSubjectTeacher
) => ({
  organization_id: organizationId,
  class_arm_id: input.classId,
  subject_id: input.subjectId,
  term_id: input.termId,
  user_id: input.userId,
  assigned_by: input.assignedBy,
});

@Injectable()
export class KyselySubjectRepository extends SubjectRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly clock: Clock
  ) {
    super();
  }

  private subjects(organizationId: string) {
    return this.db
      .selectFrom('subject')
      .where('subject.organization_id', '=', organizationId)
      .select([
        'subject.id',
        'subject.code',
        'subject.name',
        'subject.retired_at',
      ]);
  }

  private async levelCodesOf(
    organizationId: string,
    subjectIds: readonly string[]
  ): Promise<Map<string, string[]>> {
    const codes = new Map<string, string[]>();
    if (subjectIds.length === 0) {
      return codes;
    }
    const rows = await this.db
      .selectFrom('level_subject')
      .innerJoin(
        'class_level',
        'class_level.id',
        'level_subject.class_level_id'
      )
      .where('level_subject.organization_id', '=', organizationId)
      .where('level_subject.subject_id', 'in', [...subjectIds])
      .select(['level_subject.subject_id', 'class_level.code'])
      .orderBy('class_level.sequence')
      .execute();
    for (const row of rows) {
      codes.set(row.subject_id, [
        ...(codes.get(row.subject_id) ?? []),
        row.code,
      ]);
    }
    return codes;
  }

  async listSubjects(
    organizationId: string,
    paging: SubjectPaging
  ): Promise<SubjectPage> {
    const base = this.subjects(organizationId).$if(
      !paging.includeRetired,
      (qb) => qb.where('subject.retired_at', 'is', null)
    );
    const [rows, total] = await Promise.all([
      base
        .orderBy(sql`(subject.retired_at IS NOT NULL)`)
        .orderBy('subject.name')
        .orderBy('subject.id')
        .limit(paging.limit)
        .offset(paging.offset)
        .execute(),
      this.db
        .selectFrom('subject')
        .where('subject.organization_id', '=', organizationId)
        .$if(!paging.includeRetired, (qb) =>
          qb.where('subject.retired_at', 'is', null)
        )
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow(),
    ]);
    const codes = await this.levelCodesOf(
      organizationId,
      rows.map((row) => row.id)
    );
    return {
      items: rows.map((row) => toSubject(row, codes.get(row.id) ?? [])),
      total: Number(total.total),
    };
  }

  private async one(
    organizationId: string,
    row: SubjectRow | undefined
  ): Promise<SubjectRecord | undefined> {
    if (row === undefined) {
      return undefined;
    }
    const codes = await this.levelCodesOf(organizationId, [row.id]);
    return toSubject(row, codes.get(row.id) ?? []);
  }

  async findSubject(
    organizationId: string,
    id: string
  ): Promise<SubjectRecord | undefined> {
    return this.one(
      organizationId,
      await this.subjects(organizationId)
        .where('subject.id', '=', id)
        .executeTakeFirst()
    );
  }

  async findSubjectByCode(
    organizationId: string,
    code: string
  ): Promise<SubjectRecord | undefined> {
    return this.one(
      organizationId,
      await this.subjects(organizationId)
        .where('subject.code', '=', code)
        .executeTakeFirst()
    );
  }

  async insertSubject(
    organizationId: string,
    input: NewSubject
  ): Promise<string> {
    const row = await this.db
      .insertInto('subject')
      .values({
        organization_id: organizationId,
        code: input.code,
        name: input.name,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async renameSubject(
    organizationId: string,
    id: string,
    name: string
  ): Promise<void> {
    await this.db
      .updateTable('subject')
      .set({ name, updated_at: new Date() })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async setSubjectRetired(
    organizationId: string,
    id: string,
    retiredBy: string | null
  ): Promise<void> {
    await this.db
      .updateTable('subject')
      .set({
        retired_at: retiredBy === null ? null : new Date(),
        retired_by: retiredBy,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async isOnAnyLevel(organizationId: string, id: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('level_subject')
      .where('organization_id', '=', organizationId)
      .where('subject_id', '=', id)
      .select('id')
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async levelExists(organizationId: string, id: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('class_level')
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .select('id')
      .executeTakeFirst();
    return row !== undefined;
  }

  async listLevelSubjects(
    organizationId: string,
    classLevelId?: string
  ): Promise<LevelSubjectRecord[]> {
    const rows = await this.db
      .selectFrom('level_subject')
      .innerJoin('subject', 'subject.id', 'level_subject.subject_id')
      .innerJoin(
        'class_level',
        'class_level.id',
        'level_subject.class_level_id'
      )
      .where('level_subject.organization_id', '=', organizationId)
      .$if(classLevelId !== undefined, (qb) =>
        qb.where('level_subject.class_level_id', '=', classLevelId ?? '')
      )
      .select([
        'level_subject.class_level_id',
        'level_subject.subject_id',
        'level_subject.kind',
        'level_subject.sequence',
        'subject.code',
        'subject.name',
        'subject.retired_at',
      ])
      .orderBy('class_level.sequence')
      .orderBy('level_subject.sequence')
      .orderBy('subject.id')
      .execute();
    const takers = await this.takerCounts(organizationId, classLevelId);
    const counts = new Map(
      takers.map((entry) => [
        `${entry.classLevelId}:${entry.subjectId}`,
        entry.count,
      ])
    );
    return rows.map((row) => ({
      classLevelId: row.class_level_id,
      subjectId: row.subject_id,
      subjectCode: row.code,
      subjectName: row.name,
      subjectRetiredAt: isoOrNull(row.retired_at),
      kind: levelSubjectKindSchema.parse(row.kind),
      sequence: row.sequence,
      takerCount: counts.get(`${row.class_level_id}:${row.subject_id}`) ?? 0,
    }));
  }

  async subjectsByIds(
    organizationId: string,
    ids: readonly string[]
  ): Promise<SubjectRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.subjects(organizationId)
      .where('subject.id', 'in', [...ids])
      .execute();
    return rows.map((row) => toSubject(row, []));
  }

  currentSessionId(organizationId: string): Promise<string | undefined> {
    return currentSessionId(this.db, organizationId);
  }

  async replaceLevelList(
    organizationId: string,
    classLevelId: string,
    rows: readonly LevelListRow[]
  ): Promise<void> {
    const sessionId = await this.currentSessionId(organizationId);
    await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('level_subject')
        .where('organization_id', '=', organizationId)
        .where('class_level_id', '=', classLevelId)
        .where('kind', '=', 'elective')
        .select('subject_id')
        .execute();
      const stays = new Set(
        rows
          .filter((row) => row.kind === 'elective')
          .map((row) => row.subjectId)
      );
      const cleared = existing
        .map((row) => row.subject_id)
        .filter((subjectId) => !stays.has(subjectId));
      if (sessionId !== undefined && cleared.length > 0) {
        await trx
          .deleteFrom('student_subject')
          .where('organization_id', '=', organizationId)
          .where('subject_id', 'in', cleared)
          .where(
            'enrollment_id',
            'in',
            trx
              .selectFrom('student_enrollment')
              .where('organization_id', '=', organizationId)
              .where('session_id', '=', sessionId)
              .where('class_level_id', '=', classLevelId)
              .select('id')
          )
          .execute();
      }
      await trx
        .deleteFrom('level_subject')
        .where('organization_id', '=', organizationId)
        .where('class_level_id', '=', classLevelId)
        .execute();
      if (rows.length > 0) {
        await trx
          .insertInto('level_subject')
          .values(
            rows.map((row, index) => ({
              organization_id: organizationId,
              class_level_id: classLevelId,
              subject_id: row.subjectId,
              kind: row.kind,
              sequence: index + 1,
            }))
          )
          .execute();
      }
    });
  }

  async takerCounts(
    organizationId: string,
    classLevelId?: string
  ): Promise<TakerCount[]> {
    const sessionId = await this.currentSessionId(organizationId);
    if (sessionId === undefined) {
      return [];
    }
    const rows = await this.db
      .selectFrom('student_subject')
      .innerJoin(
        'student_enrollment',
        'student_enrollment.id',
        'student_subject.enrollment_id'
      )
      .where('student_subject.organization_id', '=', organizationId)
      .where('student_enrollment.session_id', '=', sessionId)
      .where('student_enrollment.status', '=', 'active')
      .$if(classLevelId !== undefined, (qb) =>
        qb.where('student_enrollment.class_level_id', '=', classLevelId ?? '')
      )
      .select([
        'student_enrollment.class_level_id',
        'student_subject.subject_id',
        (eb) => eb.fn.countAll<string>().as('total'),
      ])
      .groupBy([
        'student_enrollment.class_level_id',
        'student_subject.subject_id',
      ])
      .execute();
    return rows.map((row) => ({
      classLevelId: row.class_level_id,
      subjectId: row.subject_id,
      count: Number(row.total),
    }));
  }

  async findSession(
    organizationId: string,
    id: string
  ): Promise<SessionRecord | undefined> {
    return this.db
      .selectFrom('academic_session')
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .select(['id', 'name'])
      .executeTakeFirst();
  }

  async visibleElectiveStudents(
    organizationId: string,
    scope: CampusClassScope,
    query: ElectiveStudentQuery
  ): Promise<ElectiveStudentRecord[]> {
    if (query.studentIds?.length === 0) {
      return [];
    }
    const { rows } = await electiveStudentsStatement({
      organizationId,
      scope,
      today: schoolToday({ organizationId }, this.clock),
      query,
    }).execute(this.db);
    return rows.map((row) => ({
      studentId: row.id,
      name: `${row.first_name} ${row.last_name}`,
      admissionNumber: row.admission_number,
      classId: row.class_id,
      className: row.class_name,
      enrollmentId: row.enrollment_id,
      classLevelId: row.class_level_id,
    }));
  }

  async electiveTakers(
    organizationId: string,
    sessionId: string,
    enrollmentIds: readonly string[]
  ): Promise<ElectiveTakerRow[]> {
    if (enrollmentIds.length === 0) {
      return [];
    }
    const rows = await studentSubjectsOf(this.db, organizationId, enrollmentIds)
      .where('student_enrollment.session_id', '=', sessionId)
      .select(['student_subject.enrollment_id', 'student_subject.subject_id'])
      .execute();
    return rows.map((row) => ({
      enrollmentId: row.enrollment_id,
      subjectId: row.subject_id,
    }));
  }

  async electiveLevels(organizationId: string): Promise<ElectiveLevelRecord[]> {
    const rows = await this.db
      .selectFrom('level_subject')
      .innerJoin('subject', 'subject.id', 'level_subject.subject_id')
      .where('level_subject.organization_id', '=', organizationId)
      .where('level_subject.kind', '=', 'elective')
      .select([
        'level_subject.subject_id',
        'level_subject.class_level_id',
        'subject.name',
      ])
      .orderBy('subject.name')
      .orderBy('subject.id')
      .execute();
    return rows.map((row) => ({
      subjectId: row.subject_id,
      subjectName: row.name,
      classLevelId: row.class_level_id,
    }));
  }

  async setElectiveTakers(
    organizationId: string,
    write: ElectiveWrite
  ): Promise<void> {
    const { subjectId, enrollmentIds, visibleEnrollmentIds } = write;
    const listed = new Set(enrollmentIds);
    const unlisted = visibleEnrollmentIds.filter((id) => !listed.has(id));
    await this.db.transaction().execute(async (trx) => {
      if (enrollmentIds.length > 0) {
        await trx
          .insertInto('student_subject')
          .values(
            enrollmentIds.map((enrollmentId) => ({
              organization_id: organizationId,
              enrollment_id: enrollmentId,
              subject_id: subjectId,
            }))
          )
          .onConflict((conflict) =>
            conflict.columns(['enrollment_id', 'subject_id']).doNothing()
          )
          .execute();
      }
      if (unlisted.length > 0) {
        await trx
          .deleteFrom('student_subject')
          .where('organization_id', '=', organizationId)
          .where('subject_id', '=', subjectId)
          .where('enrollment_id', 'in', unlisted)
          .execute();
      }
    });
  }

  async currentTerm(organizationId: string): Promise<TermRecord | undefined> {
    return this.db
      .selectFrom('term')
      .where('organization_id', '=', organizationId)
      .where('is_current', '=', true)
      .select(['id', 'name'])
      .executeTakeFirst();
  }

  async previousTerm(organizationId: string): Promise<TermRecord | undefined> {
    return this.db
      .selectFrom('term')
      .where('term.organization_id', '=', organizationId)
      .where(
        'term.starts_on',
        '<',
        this.db
          .selectFrom('term as current')
          .where('current.organization_id', '=', organizationId)
          .where('current.is_current', '=', true)
          .select('current.starts_on')
      )
      .select(['term.id', 'term.name'])
      .orderBy('term.starts_on', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async listArmSubjects(
    organizationId: string,
    classIds: readonly string[],
    termId: string
  ): Promise<ArmSubjectRecord[]> {
    if (classIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('class_arm')
      .innerJoin('level_subject', (join) =>
        join
          .onRef(
            'level_subject.class_level_id',
            '=',
            'class_arm.class_level_id'
          )
          .onRef(
            'level_subject.organization_id',
            '=',
            'class_arm.organization_id'
          )
      )
      .innerJoin('subject', 'subject.id', 'level_subject.subject_id')
      .leftJoin('subject_teacher', (join) =>
        join
          .onRef('subject_teacher.class_arm_id', '=', 'class_arm.id')
          .onRef('subject_teacher.subject_id', '=', 'level_subject.subject_id')
          .on('subject_teacher.term_id', '=', termId)
      )
      .leftJoin('user', 'user.id', 'subject_teacher.user_id')
      .where('class_arm.organization_id', '=', organizationId)
      .where('class_arm.id', 'in', [...classIds])
      .select([
        'class_arm.id as class_arm_id',
        'level_subject.subject_id',
        'level_subject.kind',
        'level_subject.sequence',
        'subject.code',
        'subject.name',
        'user.id as teacher_id',
        'user.name as teacher_name',
      ])
      .orderBy('level_subject.sequence')
      .orderBy('subject.id')
      .execute();
    return rows.map((row) => ({
      classId: row.class_arm_id,
      subjectId: row.subject_id,
      code: row.code,
      name: row.name,
      kind: levelSubjectKindSchema.parse(row.kind),
      sequence: row.sequence,
      teacher:
        row.teacher_id === null || row.teacher_name === null
          ? null
          : { userId: row.teacher_id, name: row.teacher_name },
    }));
  }

  async listAssignments(
    organizationId: string,
    classIds: readonly string[],
    termId: string
  ): Promise<TermAssignment[]> {
    if (classIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('subject_teacher')
      .where('organization_id', '=', organizationId)
      .where('term_id', '=', termId)
      .where('class_arm_id', 'in', [...classIds])
      .select(['class_arm_id', 'subject_id', 'user_id'])
      .execute();
    return rows.map((row) => ({
      classId: row.class_arm_id,
      subjectId: row.subject_id,
      userId: row.user_id,
    }));
  }

  async upsertSubjectTeacher(
    organizationId: string,
    input: NewSubjectTeacher
  ): Promise<void> {
    await this.db
      .insertInto('subject_teacher')
      .values(subjectTeacherValues(organizationId, input))
      .onConflict((conflict) =>
        conflict
          .columns(['class_arm_id', 'subject_id', 'term_id'])
          .doUpdateSet({
            user_id: input.userId,
            assigned_by: input.assignedBy,
            updated_at: new Date(),
          })
      )
      .execute();
  }

  async insertSubjectTeacherIfEmpty(
    organizationId: string,
    input: NewSubjectTeacher
  ): Promise<boolean> {
    const result = await this.db
      .insertInto('subject_teacher')
      .values(subjectTeacherValues(organizationId, input))
      .onConflict((conflict) =>
        conflict.columns(['class_arm_id', 'subject_id', 'term_id']).doNothing()
      )
      .executeTakeFirst();
    return (result.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async deleteSubjectTeacher(
    organizationId: string,
    key: SubjectTeacherKey
  ): Promise<boolean> {
    const result = await this.db
      .deleteFrom('subject_teacher')
      .where('organization_id', '=', organizationId)
      .where('class_arm_id', '=', key.classId)
      .where('subject_id', '=', key.subjectId)
      .where('term_id', '=', key.termId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
