import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { StudentLife } from '@eduvault/api-contract';
import { ActivityWriter } from '../../common/activity';
import type { CampusScope } from '../../common/campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { archiveGraduates, visibleStudentsCte } from '../../common/students';
import type {
  ArmFact,
  LevelFact,
  PlannedEnrolment,
  RowArmFacts,
  StudentRowFacts,
  WaitingStudent,
  YearRange,
} from './new-school-year';
import {
  NewSchoolYearRepository,
  type FirstTerm,
  type StartCalendar,
  type StartWrite,
  type StartWritten,
  type WaitingFacts,
  type YearPair,
} from './new-school-year.repository';

const INSERT_CHUNK = 500;

const chunked = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / INSERT_CHUNK) }, (_, index) =>
    items.slice(index * INSERT_CHUNK, (index + 1) * INSERT_CHUNK)
  );

interface WaitingRow {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  inactive: boolean;
  level_id: string;
  arm_id: string | null;
}

interface FactsRow {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  campus_id: string;
  life: StudentLife;
  in_target: boolean;
  level_id: string | null;
  level_name: string | null;
  next_level_id: string | null;
  next_level_name: string | null;
}

const scopeCte = (
  organizationId: string,
  scope: CampusScope,
  years: YearPair
) =>
  visibleStudentsCte({
    organizationId,
    campusScope: scope,
    classScope: 'all',
    today: years.today,
  });

const targetEnrolment = (years: YearPair) =>
  sql`EXISTS (
    SELECT 1 FROM student_enrollment te
    WHERE te.student_id = v.id AND te.session_id = ${years.targetYearId}::uuid
  )`;

@Injectable()
export class KyselyNewSchoolYearRepository extends NewSchoolYearRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  async calendar(organizationId: string): Promise<StartCalendar | undefined> {
    const current = await sql<{
      term_id: string;
      session_id: string;
      sequence: number;
      last_sequence: number;
    }>`
      SELECT
        t.id AS term_id,
        t.session_id,
        t.sequence,
        (SELECT max(x.sequence) FROM term x WHERE x.session_id = t.session_id)::int AS last_sequence
      FROM term t
      WHERE t.organization_id = ${organizationId} AND t.is_current`.execute(
      this.db
    );
    const [term] = current.rows;
    if (term === undefined) {
      return undefined;
    }
    const years = await sql<{
      id: string;
      name: string;
      starts_on: string;
      ends_on: string;
    }>`
      SELECT
        id,
        name,
        to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
        to_char(ends_on, 'YYYY-MM-DD') AS ends_on
      FROM academic_session
      WHERE organization_id = ${organizationId}
      ORDER BY starts_on`.execute(this.db);
    return {
      currentTerm: {
        termId: term.term_id,
        sessionId: term.session_id,
        sequence: term.sequence,
      },
      lastSequence: term.last_sequence,
      years: years.rows.map((year): YearRange => ({
        id: year.id,
        name: year.name,
        startsOn: year.starts_on,
        endsOn: year.ends_on,
      })),
    };
  }

  async firstTerm(
    organizationId: string,
    yearId: string
  ): Promise<FirstTerm | undefined> {
    const row = await this.db
      .selectFrom('term')
      .select(['id', 'name', 'is_current'])
      .where('organization_id', '=', organizationId)
      .where('session_id', '=', yearId)
      .where('sequence', '=', 1)
      .executeTakeFirst();
    return row && { id: row.id, name: row.name, isCurrent: row.is_current };
  }

  async waiting(
    organizationId: string,
    scope: CampusScope,
    years: YearPair
  ): Promise<WaitingFacts> {
    const [students, inTarget, levels, arms] = await Promise.all([
      this.waitingStudents(organizationId, scope, years),
      this.alreadyInTarget(organizationId, scope, years),
      this.levels(organizationId),
      this.arms(organizationId),
    ]);
    return { students, alreadyInTarget: inTarget, levels, arms };
  }

  async countWaiting(
    organizationId: string,
    scope: CampusScope,
    years: YearPair
  ): Promise<number> {
    const { rows } = await sql<{ waiting: number }>`
      WITH ${scopeCte(organizationId, scope, years)}
      SELECT count(*)::int AS waiting
      FROM visible v
      WHERE v.life = 'active'
        AND EXISTS (
          SELECT 1 FROM student_enrollment en
          WHERE en.student_id = v.id
            AND en.session_id = ${years.leavingYearId}::uuid
            AND en.status = 'active'
        )
        AND NOT ${targetEnrolment(years)}`.execute(this.db);
    return rows[0]?.waiting ?? 0;
  }

  async studentFacts(
    organizationId: string,
    scope: CampusScope,
    input: YearPair & { studentIds: readonly string[] }
  ): Promise<StudentRowFacts[]> {
    const { rows } = await sql<FactsRow>`
      WITH ${scopeCte(organizationId, scope, input)}
      SELECT
        v.id,
        v.user_id,
        v.first_name,
        v.last_name,
        v.campus_id,
        v.life,
        ${targetEnrolment(input)} AS in_target,
        lvl.id AS level_id,
        lvl.name AS level_name,
        lvl.next_level_id,
        nxt.name AS next_level_name
      FROM visible v
      LEFT JOIN student_enrollment en
        ON en.student_id = v.id
        AND en.organization_id = ${organizationId}
        AND en.session_id = ${input.leavingYearId}::uuid
        AND en.status = 'active'
      LEFT JOIN class_level lvl ON lvl.id = en.class_level_id
      LEFT JOIN class_level nxt ON nxt.id = lvl.next_level_id
      WHERE v.id = ANY(${[...input.studentIds]}::uuid[])`.execute(this.db);
    return rows.map((row) => ({
      studentId: row.id,
      userId: row.user_id,
      name: `${row.first_name} ${row.last_name}`,
      campusId: row.campus_id,
      life: row.life,
      inTarget: row.in_target,
      level:
        row.level_id === null
          ? null
          : {
              levelId: row.level_id,
              levelName: row.level_name ?? '',
              nextLevelId: row.next_level_id,
              nextLevelName: row.next_level_name,
            },
    }));
  }

  async findArms(
    organizationId: string,
    ids: readonly string[]
  ): Promise<RowArmFacts[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('class_arm as arm')
      .innerJoin('class_level as lvl', 'lvl.id', 'arm.class_level_id')
      .select([
        'arm.id',
        'arm.class_level_id as levelId',
        'arm.campus_id as campusId',
        'arm.retired_at as retiredAt',
        'lvl.name as levelName',
        'arm.name as armName',
      ])
      .where('arm.organization_id', '=', organizationId)
      .where('arm.id', 'in', [...ids])
      .execute();
    return rows.map((row) => ({
      id: row.id,
      levelId: row.levelId,
      campusId: row.campusId,
      display: `${row.levelName} ${row.armName}`,
      retired: row.retiredAt !== null,
    }));
  }

  start(write: StartWrite): Promise<StartWritten> {
    return this.db.transaction().execute(async (trx) => {
      const enrolled = await this.insertEnrolments(trx, write);
      const graduated = await archiveGraduates(trx, this.activity, {
        organizationId: write.organizationId,
        actorUserId: write.actor.id,
        termId: write.currentTerm.termId,
        sessionId: write.leavingYear.id,
        students: write.graduates,
      });
      const written = { ...enrolled, graduated };
      await this.activity.record(trx, {
        organizationId: write.organizationId,
        campusId: null,
        pillar: 'foundation',
        kind: 'school_year.started',
        actorUserId: write.actor.id,
        subjectType: 'school_year',
        subjectId: write.targetYear.id,
        text: `${write.actor.name} started ${write.targetYear.name}: ${written.moved} moved up, ${written.repeating} repeating, ${written.graduated} graduated.`,
        data: { ...written },
      });
      return written;
    });
  }

  private async insertEnrolments(
    trx: Database,
    write: StartWrite
  ): Promise<Pick<StartWritten, 'moved' | 'repeating'>> {
    const byStudent = new Map(
      write.enrolments.map((enrolment) => [enrolment.studentId, enrolment])
    );
    const inserted: PlannedEnrolment[] = [];
    for (const chunk of chunked(write.enrolments)) {
      const rows = await trx
        .insertInto('student_enrollment')
        .values(
          chunk.map((enrolment) => ({
            organization_id: write.organizationId,
            student_id: enrolment.studentId,
            session_id: write.targetYear.id,
            class_level_id: enrolment.levelId,
            status: 'active',
            is_new_student: false,
            created_by: write.actor.id,
          }))
        )
        .onConflict((conflict) =>
          conflict.columns(['student_id', 'session_id']).doNothing()
        )
        .returning(['id', 'student_id'])
        .execute();
      const placements = rows.flatMap((row) => {
        const enrolment = byStudent.get(row.student_id);
        return enrolment === undefined
          ? []
          : [{ enrollmentId: row.id, enrolment }];
      });
      if (placements.length > 0) {
        await trx
          .insertInto('enrollment_placement')
          .values(
            placements.map(({ enrollmentId, enrolment }) => ({
              organization_id: write.organizationId,
              enrollment_id: enrollmentId,
              term_id: write.targetYear.firstTermId,
              class_arm_id: enrolment.armId,
              campus_id: enrolment.campusId,
              created_by: write.actor.id,
            }))
          )
          .execute();
      }
      inserted.push(...placements.map((placement) => placement.enrolment));
    }
    return {
      moved: inserted.filter((enrolment) => enrolment.outcome === 'move')
        .length,
      repeating: inserted.filter((enrolment) => enrolment.outcome === 'repeat')
        .length,
    };
  }

  private async waitingStudents(
    organizationId: string,
    scope: CampusScope,
    years: YearPair
  ): Promise<WaitingStudent[]> {
    const { rows } = await sql<WaitingRow>`
      WITH ${scopeCte(organizationId, scope, years)}
      SELECT
        v.id,
        v.first_name,
        v.last_name,
        v.admission_number,
        (v.life = 'inactive') AS inactive,
        en.class_level_id AS level_id,
        latest.class_arm_id AS arm_id
      FROM visible v
      JOIN student_enrollment en
        ON en.student_id = v.id
        AND en.organization_id = ${organizationId}
        AND en.session_id = ${years.leavingYearId}::uuid
        AND en.status = 'active'
      LEFT JOIN LATERAL (
        SELECT ep.class_arm_id
        FROM enrollment_placement ep
        JOIN term t ON t.id = ep.term_id
        WHERE ep.enrollment_id = en.id
        ORDER BY t.sequence DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE v.life IN ('active', 'inactive')
        AND NOT ${targetEnrolment(years)}`.execute(this.db);
    return rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      admissionNumber: row.admission_number,
      inactive: row.inactive,
      levelId: row.level_id,
      armId: row.arm_id,
    }));
  }

  private async alreadyInTarget(
    organizationId: string,
    scope: CampusScope,
    years: YearPair
  ): Promise<number> {
    const { rows } = await sql<{ total: number }>`
      WITH ${scopeCte(organizationId, scope, years)}
      SELECT count(*)::int AS total
      FROM visible v
      WHERE v.life IN ('active', 'inactive') AND ${targetEnrolment(years)}`.execute(
      this.db
    );
    return rows[0]?.total ?? 0;
  }

  private async levels(organizationId: string): Promise<LevelFact[]> {
    const rows = await this.db
      .selectFrom('class_level')
      .select(['id', 'name', 'sequence', 'next_level_id'])
      .where('organization_id', '=', organizationId)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sequence: row.sequence,
      nextLevelId: row.next_level_id,
    }));
  }

  private async arms(organizationId: string): Promise<ArmFact[]> {
    const rows = await this.db
      .selectFrom('class_arm as arm')
      .innerJoin('class_level as lvl', 'lvl.id', 'arm.class_level_id')
      .innerJoin('team', 'team.id', 'arm.campus_id')
      .select([
        'arm.id',
        'arm.class_level_id as levelId',
        'arm.name',
        'arm.campus_id as campusId',
        'arm.retired_at as retiredAt',
        'lvl.name as levelName',
        'team.name as campusName',
      ])
      .where('arm.organization_id', '=', organizationId)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      levelId: row.levelId,
      levelName: row.levelName,
      name: row.name,
      campusId: row.campusId,
      campusName: row.campusName,
      retired: row.retiredAt !== null,
    }));
  }
}
