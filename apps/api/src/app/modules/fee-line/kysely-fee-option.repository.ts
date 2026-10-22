import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder, type SqlBool, type Transaction } from 'kysely';
import {
  FEE_OPT_IN_LIMIT,
  type FeeOptInRow,
  type FeeOptIns,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { ActivityWriter } from '../../common/activity';
import { Clock, schoolToday } from '../../common/clock';
import { currentSessionId } from '../../common/db/current-session';
import { escapeLike } from '../../common/db/escape-like';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { findStudentIdentity, visibleStudentsCte } from '../../common/students';
import {
  FeeOptionRepository,
  type OptionActivity,
  type OptionChange,
} from './fee-line.repository';
import type { OrgScope } from '../../common/scope';

const liveOptionalLine = (student: {
  classLevelId: RawBuilder<unknown>;
  enrollmentId: RawBuilder<unknown>;
  homeCampusId: RawBuilder<unknown>;
}) => sql<SqlBool>`(
  fl.is_optional
  AND fl.retired_at IS NULL
  AND fl.class_level_id = ${student.classLevelId}
  AND (
    fl.campus_id IS NULL
    OR fl.campus_id = ${student.homeCampusId}
    OR EXISTS (
      SELECT 1
      FROM enrollment_placement p
      WHERE p.enrollment_id = ${student.enrollmentId}
        AND p.organization_id = fl.organization_id
        AND p.campus_id = fl.campus_id
    )
  )
)`;

const takesOrCanTake = (query: {
  sessionId: string;
  feeTypeId: string;
}) => sql`(
  opt.id IS NOT NULL
  OR EXISTS (
    SELECT 1
    FROM fee_line fl
    JOIN term tm
      ON tm.id = fl.term_id AND tm.organization_id = fl.organization_id
    WHERE fl.organization_id = v.organization_id
      AND tm.session_id = ${query.sessionId}
      AND fl.ledger_account_id = ${query.feeTypeId}
      AND ${liveOptionalLine({
        classLevelId: sql.ref('e.class_level_id'),
        enrollmentId: sql.ref('e.id'),
        homeCampusId: sql.ref('v.home_campus_id'),
      })}
  )
)`;

interface RosterRow {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  level_name: string;
  campus_name: string;
  opted_in: boolean;
}

const optInRow = (row: RosterRow): FeeOptInRow => ({
  studentId: row.id,
  name: `${row.first_name} ${row.last_name}`,
  admissionNumber: row.admission_number,
  levelName: row.level_name,
  campusName: row.campus_name,
  optedIn: row.opted_in,
});

@Injectable()
export class KyselyFeeOptionRepository extends FeeOptionRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter,
    private readonly clock: Clock
  ) {
    super();
  }

  async hasSession(organizationId: string, id: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('academic_session')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row !== undefined;
  }

  currentSessionId(organizationId: string): Promise<string | undefined> {
    return currentSessionId(this.db, organizationId);
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
      .where(
        liveOptionalLine({
          classLevelId: sql`${query.classLevelId}`,
          enrollmentId: sql`${query.enrollmentId}`,
          homeCampusId: sql`${query.homeCampusId}`,
        })
      )
      .orderBy('la.code')
      .execute();
    return rows.map((row) => ({ feeTypeId: row.id, name: row.name }));
  }

  async optInRoster(
    scope: OrgScope,
    query: { sessionId: string; feeTypeId: string; q: string | undefined }
  ): Promise<Pick<FeeOptIns, 'items' | 'total'>> {
    const { organizationId, campusScope } = scope;
    const today = schoolToday({ organizationId }, this.clock);
    const pattern = query.q === undefined ? null : `%${escapeLike(query.q)}%`;
    const { rows } = await sql<RosterRow & { total: number }>`
      WITH ${visibleStudentsCte({ organizationId, campusScope, classScope: 'all', today })}
      SELECT
        v.id, v.first_name, v.last_name, v.admission_number,
        cl.name AS level_name,
        campus.name AS campus_name,
        (opt.id IS NOT NULL) AS opted_in,
        (count(*) OVER ())::int AS total
      FROM visible v
      JOIN student_enrollment e
        ON e.student_id = v.id
        AND e.organization_id = v.organization_id
        AND e.session_id = ${query.sessionId}
        AND e.status = 'active'
      JOIN class_level cl
        ON cl.id = e.class_level_id AND cl.organization_id = e.organization_id
      JOIN team campus ON campus.id = v.campus_id
      LEFT JOIN student_fee_option opt
        ON opt.enrollment_id = e.id
        AND opt.organization_id = e.organization_id
        AND opt.ledger_account_id = ${query.feeTypeId}
      WHERE v.life = 'active'
        AND ${takesOrCanTake(query)}
        AND (
          ${pattern}::text IS NULL
          OR (v.first_name || ' ' || v.last_name) ILIKE ${pattern}
          OR v.admission_number ILIKE ${pattern}
          OR cl.name ILIKE ${pattern}
        )
      ORDER BY v.last_name, v.first_name, v.admission_number
      LIMIT ${FEE_OPT_IN_LIMIT}`.execute(this.db);
    return {
      items: rows.map((row) => optInRow(row)),
      total: rows[0]?.total ?? 0,
    };
  }

  setOption(change: OptionChange, activity: OptionActivity): Promise<boolean> {
    return this.db
      .transaction()
      .execute((trx) => this.applyChange(trx, change, activity));
  }

  setOptions(
    changes: { change: OptionChange; activity: OptionActivity }[]
  ): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      let changed = 0;
      for (const { change, activity } of changes) {
        if (await this.applyChange(trx, change, activity)) {
          changed += 1;
        }
      }
      return changed;
    });
  }

  private async applyChange(
    trx: Transaction<DB>,
    change: OptionChange,
    activity: OptionActivity
  ): Promise<boolean> {
    const changed = change.optedIn
      ? await trx
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
          .returning('id')
          .execute()
      : await trx
          .deleteFrom('student_fee_option')
          .where('organization_id', '=', change.organizationId)
          .where('enrollment_id', '=', change.enrollmentId)
          .where('ledger_account_id', '=', change.feeTypeId)
          .returning('id')
          .execute();
    if (changed.length === 0) {
      return false;
    }
    const student = await findStudentIdentity(
      trx,
      { organizationId: change.organizationId, campusScope: 'all' },
      change.studentId
    );
    const feeType = await trx
      .selectFrom('ledger_account')
      .select(['id', 'name'])
      .where('organization_id', '=', change.organizationId)
      .where('id', '=', change.feeTypeId)
      .executeTakeFirst();
    if (student === undefined || feeType === undefined) {
      throw new Error('A fee option change needs its student and fee type');
    }
    await this.activity.within(trx).recordMany(activity({ student, feeType }));
    return true;
  }
}
