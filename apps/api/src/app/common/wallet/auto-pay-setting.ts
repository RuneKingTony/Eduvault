import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

interface AutoPaySetting {
  enabled: boolean;
  createdBy: string;
}

/** The setting is an append-only log; the latest row is the current value and no row means off. */
export async function latestAutoPay(
  db: Kysely<DB>,
  family: { organizationId: string; guardianId: string }
): Promise<AutoPaySetting | undefined> {
  const row = await db
    .selectFrom('wallet_auto_pay_setting')
    .select(['enabled', 'created_by'])
    .where('organization_id', '=', family.organizationId)
    .where('guardian_id', '=', family.guardianId)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row && { enabled: row.enabled, createdBy: row.created_by };
}
