import {
  FEE_INCOME_SYSTEM_KEY,
  OTHER_CHARGES_SYSTEM_KEY,
} from '@eduvault/api-contract';
import type { Database } from '../db/tokens';

export const feeTypeQuery = (db: Database, organizationId: string) =>
  db
    .selectFrom('ledger_account')
    .innerJoin('ledger_account as parent', (join) =>
      join
        .onRef('parent.id', '=', 'ledger_account.parent_id')
        .onRef('parent.organization_id', '=', 'ledger_account.organization_id')
    )
    .select(['ledger_account.id', 'ledger_account.code', 'ledger_account.name'])
    .where('ledger_account.organization_id', '=', organizationId)
    .where('parent.system_key', '=', FEE_INCOME_SYSTEM_KEY)
    .where('ledger_account.retired_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb('ledger_account.system_key', 'is', null),
        eb('ledger_account.system_key', '<>', OTHER_CHARGES_SYSTEM_KEY),
      ])
    );
