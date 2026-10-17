import { Inject, Injectable } from '@nestjs/common';
import { currentSessionId } from '../../common/db/current-session';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { FeeOptionRepository, type OptionChange } from './fee-line.repository';

@Injectable()
export class KyselyFeeOptionRepository extends FeeOptionRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
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
