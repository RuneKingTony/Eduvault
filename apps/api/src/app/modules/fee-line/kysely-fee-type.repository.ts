import { Inject, Injectable } from '@nestjs/common';
import { FEE_INCOME_SYSTEM_KEY, type FeeType } from '@eduvault/api-contract';
import { ActivityWriter } from '../../common/activity';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  feeTypeQuery,
  insertChildAccount,
  transactAccounts,
} from '../../common/ledger';
import {
  FeeTypeRepository,
  type FeeTypeOutcome,
  type TypeActivity,
} from './fee-line.repository';

@Injectable()
export class KyselyFeeTypeRepository extends FeeTypeRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  list(organizationId: string): Promise<FeeType[]> {
    return feeTypeQuery(this.db, organizationId)
      .orderBy('ledger_account.code')
      .execute();
  }

  create(
    organizationId: string,
    name: string,
    activity: TypeActivity
  ): Promise<FeeTypeOutcome> {
    return transactAccounts(this.db, async (trx): Promise<FeeTypeOutcome> => {
      const parent = await trx
        .selectFrom('ledger_account')
        .select('id')
        .where('organization_id', '=', organizationId)
        .where('system_key', '=', FEE_INCOME_SYSTEM_KEY)
        .executeTakeFirstOrThrow();
      const inserted = await insertChildAccount(trx, {
        organizationId,
        parentId: parent.id,
        name,
      });
      if (inserted.status === 'name_taken') {
        return inserted;
      }
      const { row } = inserted;
      const feeType = { id: row.id, code: row.code, name: row.name };
      await this.activity.within(trx).recordMany(activity(feeType));
      return { status: 'saved', feeType };
    });
  }
}
