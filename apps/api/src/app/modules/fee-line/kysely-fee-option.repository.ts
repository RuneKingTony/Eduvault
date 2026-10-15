import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  FEE_CANDIDATE_LIMIT,
  type FeeCandidates,
} from '@eduvault/api-contract';
import { Clock, schoolToday } from '../../common/clock';
import { escapeLike } from '../../common/db/escape-like';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { visibleStudentsCte } from '../../common/students';
import {
  FeeOptionRepository,
  type FeeScope,
  type OptionChange,
  type StudentFeeContext,
} from './fee-line.repository';

@Injectable()
export class KyselyFeeOptionRepository extends FeeOptionRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly clock: Clock
  ) {
    super();
  }

  async findStudent(
    scope: FeeScope,
    query: {
      studentId: string;
      sessionId: string | undefined;
      termId?: string;
    }
  ): Promise<StudentFeeContext | undefined> {
    const { organizationId, campusScope } = scope;
    const today = schoolToday({ organizationId }, this.clock);
    const { rows } = await sql<{ id: string }>`
      WITH ${visibleStudentsCte({ organizationId, campusScope, classScope: 'all', today, studentId: query.studentId })}
      SELECT id FROM visible`.execute(this.db);
    if (rows.length === 0) {
      return undefined;
    }
    const student = await this.db
      .selectFrom('student as s')
      .innerJoin('team as home', 'home.id', 's.campus_id')
      .select([
        's.id',
        's.first_name',
        's.last_name',
        's.campus_id',
        'home.name as campus_name',
      ])
      .where('s.organization_id', '=', organizationId)
      .where('s.id', '=', query.studentId)
      .executeTakeFirstOrThrow();
    const enrollment =
      query.sessionId === undefined
        ? undefined
        : await this.enrollment(organizationId, {
            studentId: query.studentId,
            sessionId: query.sessionId,
          });
    return {
      studentId: student.id,
      name: `${student.first_name} ${student.last_name}`,
      homeCampusId: student.campus_id,
      homeCampusName: student.campus_name,
      enrollment: enrollment ?? null,
      placement:
        enrollment === undefined || query.termId === undefined
          ? null
          : ((await this.placement(
              organizationId,
              enrollment.id,
              query.termId
            )) ?? null),
    };
  }

  private async enrollment(
    organizationId: string,
    query: { studentId: string; sessionId: string }
  ) {
    const row = await this.db
      .selectFrom('student_enrollment as e')
      .innerJoin('class_level as cl', (join) =>
        join
          .onRef('cl.id', '=', 'e.class_level_id')
          .onRef('cl.organization_id', '=', 'e.organization_id')
      )
      .select([
        'e.id',
        'e.class_level_id',
        'cl.name as level_name',
        'e.is_new_student',
      ])
      .where('e.organization_id', '=', organizationId)
      .where('e.student_id', '=', query.studentId)
      .where('e.session_id', '=', query.sessionId)
      .where('e.status', '=', 'active')
      .executeTakeFirst();
    return (
      row && {
        id: row.id,
        classLevelId: row.class_level_id,
        levelName: row.level_name,
        isNew: row.is_new_student,
      }
    );
  }

  private async placement(
    organizationId: string,
    enrollmentId: string,
    termId: string
  ) {
    const row = await this.db
      .selectFrom('enrollment_placement as p')
      .innerJoin('class_arm as arm', (join) =>
        join
          .onRef('arm.id', '=', 'p.class_arm_id')
          .onRef('arm.organization_id', '=', 'p.organization_id')
      )
      .innerJoin('team as campus', 'campus.id', 'p.campus_id')
      .select([
        'arm.name as arm_name',
        'p.campus_id',
        'campus.name as campus_name',
      ])
      .where('p.organization_id', '=', organizationId)
      .where('p.enrollment_id', '=', enrollmentId)
      .where('p.term_id', '=', termId)
      .executeTakeFirst();
    return (
      row && {
        armName: row.arm_name,
        campusId: row.campus_id,
        campusName: row.campus_name,
      }
    );
  }

  async candidates(
    scope: FeeScope,
    query: { sessionId: string; q: string | undefined }
  ): Promise<FeeCandidates> {
    const { organizationId, campusScope } = scope;
    const today = schoolToday({ organizationId }, this.clock);
    const pattern =
      query.q === undefined || query.q === ''
        ? null
        : `%${escapeLike(query.q)}%`;
    const { rows } = await sql<{
      id: string;
      first_name: string;
      last_name: string;
      admission_number: string;
      level_name: string;
      total: number;
    }>`
      WITH ${visibleStudentsCte({ organizationId, campusScope, classScope: 'all', today })}
      SELECT
        v.id, v.first_name, v.last_name, v.admission_number,
        cl.name AS level_name,
        (count(*) OVER ())::int AS total
      FROM visible v
      JOIN student_enrollment e
        ON e.student_id = v.id
        AND e.organization_id = v.organization_id
        AND e.session_id = ${query.sessionId}
        AND e.status = 'active'
      JOIN class_level cl
        ON cl.id = e.class_level_id AND cl.organization_id = e.organization_id
      WHERE v.life = 'active'
        AND (
          ${pattern}::text IS NULL
          OR (v.first_name || ' ' || v.last_name) ILIKE ${pattern}
          OR v.admission_number ILIKE ${pattern}
          OR cl.name ILIKE ${pattern}
        )
      ORDER BY v.last_name, v.first_name, v.admission_number
      LIMIT ${FEE_CANDIDATE_LIMIT}`.execute(this.db);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name}`,
        admissionNumber: row.admission_number,
        levelName: row.level_name,
      })),
      total: rows[0]?.total ?? 0,
    };
  }

  async currentSessionId(organizationId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('term')
      .select('session_id')
      .where('organization_id', '=', organizationId)
      .where('is_current', '=', true)
      .executeTakeFirst();
    return row?.session_id;
  }

  async optedInFeeTypeIds(
    organizationId: string,
    enrollmentId: string
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('student_fee_option')
      .select('ledger_account_id')
      .where('organization_id', '=', organizationId)
      .where('enrollment_id', '=', enrollmentId)
      .execute();
    return rows.map((row) => row.ledger_account_id);
  }

  async optionalFeeTypes(
    organizationId: string,
    query: {
      sessionId: string;
      classLevelId: string;
      enrollmentId: string;
      homeCampusId: string;
    }
  ): Promise<{ feeTypeId: string; name: string }[]> {
    const rows = await this.db
      .selectFrom('fee_line as fl')
      .innerJoin('term as tm', (join) =>
        join
          .onRef('tm.id', '=', 'fl.term_id')
          .onRef('tm.organization_id', '=', 'fl.organization_id')
      )
      .innerJoin('ledger_account as la', (join) =>
        join
          .onRef('la.id', '=', 'fl.ledger_account_id')
          .onRef('la.organization_id', '=', 'fl.organization_id')
      )
      .select(['la.id', 'la.name', 'la.code'])
      .distinct()
      .where('fl.organization_id', '=', organizationId)
      .where('tm.session_id', '=', query.sessionId)
      .where('fl.class_level_id', '=', query.classLevelId)
      .where('fl.is_optional', '=', true)
      .where('fl.retired_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb('fl.campus_id', 'is', null),
          eb('fl.campus_id', '=', query.homeCampusId),
          eb.exists(
            eb
              .selectFrom('enrollment_placement as p')
              .select('p.id')
              .whereRef('p.campus_id', '=', 'fl.campus_id')
              .whereRef('p.organization_id', '=', 'fl.organization_id')
              .where('p.enrollment_id', '=', query.enrollmentId)
          ),
        ])
      )
      .orderBy('la.code')
      .execute();
    return rows.map((row) => ({ feeTypeId: row.id, name: row.name }));
  }

  async setOption(change: OptionChange): Promise<void> {
    if (change.optedIn) {
      await this.db
        .insertInto('student_fee_option')
        .values({
          organization_id: change.organizationId,
          enrollment_id: change.enrollmentId,
          ledger_account_id: change.feeTypeId,
          created_by: change.userId,
        })
        .onConflict((conflict) =>
          conflict
            .constraint('student_fee_option_enrollment_account_key')
            .doNothing()
        )
        .execute();
      return;
    }
    await this.db
      .deleteFrom('student_fee_option')
      .where('organization_id', '=', change.organizationId)
      .where('enrollment_id', '=', change.enrollmentId)
      .where('ledger_account_id', '=', change.feeTypeId)
      .execute();
  }
}
