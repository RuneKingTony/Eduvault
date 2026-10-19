import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import type { CampusScope } from '../campus-scope';
import { inCampusScope } from '../db/in-campus-scope';

/** Whether a money account in the caller's reach can take money in or out. */
export type UsableMoneyAccount =
  | { status: 'missing' }
  | { status: 'retired' }
  | { status: 'gateway' }
  | { status: 'ok'; ledgerAccountId: string; campusId: string | null };

/** A school-wide account is in reach of every campus; a gateway never takes hand-entered money. */
export async function usableMoneyAccount(
  db: Kysely<DB>,
  scope: { organizationId: string; campusScope: CampusScope },
  moneyAccountId: string
): Promise<UsableMoneyAccount> {
  const row = await db
    .selectFrom('money_account')
    .select(['ledger_account_id', 'campus_id', 'kind', 'retired_at'])
    .where('organization_id', '=', scope.organizationId)
    .where('id', '=', moneyAccountId)
    .where((eb) =>
      inCampusScope(eb, 'money_account.campus_id', {
        scope: scope.campusScope,
        nullMeans: 'all',
      })
    )
    .executeTakeFirst();
  if (row === undefined) {
    return { status: 'missing' };
  }
  if (row.kind === 'gateway') {
    return { status: 'gateway' };
  }
  if (row.retired_at !== null) {
    return { status: 'retired' };
  }
  return {
    status: 'ok',
    ledgerAccountId: row.ledger_account_id,
    campusId: row.campus_id,
  };
}
