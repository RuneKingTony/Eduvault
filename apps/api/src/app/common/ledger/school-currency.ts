import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export async function schoolCurrency(
  db: Kysely<DB>,
  organizationId: string
): Promise<string> {
  const row = await db
    .selectFrom('school_account')
    .select('currency')
    .where('organization_id', '=', organizationId)
    .executeTakeFirstOrThrow();
  return row.currency;
}
