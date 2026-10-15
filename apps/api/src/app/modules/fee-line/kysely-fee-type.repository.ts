import { Inject, Injectable } from '@nestjs/common';
import { FEE_INCOME_SYSTEM_KEY, type FeeType } from '@eduvault/api-contract';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  feeTypeQuery,
  insertChildAccount,
  transactAccounts,
} from '../../common/ledger';
import { FeeTypeRepository, type FeeTypeOutcome } from './fee-line.repository';

@Injectable()
export class KyselyFeeTypeRepository extends FeeTypeRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  list(organizationId: string): Promise<FeeType[]> {
    return feeTypeQuery(this.db, organizationId)
      .orderBy('ledger_account.code')
      .execute();
  }

  create(organizationId: string, name: string): Promise<FeeTypeOutcome> {
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
      return {
        status: 'saved',
        feeType: { id: row.id, code: row.code, name: row.name },
      };
    });
  }
}
