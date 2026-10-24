import type { Pool } from 'pg';

export async function seedLedgerAccounts(
  pool: Pick<Pool, 'query'>,
  organizationId: string
): Promise<void> {
  await pool.query('SELECT seed_ledger_accounts($1)', [organizationId]);
}

/** The seeded gateway money account blocks deleting a school; an unused one is dropped first and put back if the delete fails. */
export async function withoutGatewayAccounts<T>(
  pool: Pick<Pool, 'query'>,
  organizationId: string,
  work: () => Promise<T>
): Promise<T> {
  await pool.query(
    `DELETE FROM money_account WHERE organization_id = $1 AND kind = 'gateway'`,
    [organizationId]
  );
  try {
    return await work();
  } catch (error) {
    await seedLedgerAccounts(pool, organizationId);
    throw error;
  }
}
