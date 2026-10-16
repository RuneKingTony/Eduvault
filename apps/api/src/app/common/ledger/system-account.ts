import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export async function systemAccountId(
  db: Kysely<DB>,
  organizationId: string,
  systemKey: string
): Promise<string> {
  const row = await db
    .selectFrom('ledger_account')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('system_key', '=', systemKey)
    .executeTakeFirstOrThrow();
  return row.id;
}
