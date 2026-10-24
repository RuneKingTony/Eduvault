import type { Pool } from 'pg';

export async function seedLedgerAccounts(
  pool: Pick<Pool, 'query'>,
  organizationId: string
): Promise<void> {
  await pool.query('SELECT seed_ledger_accounts($1)', [organizationId]);
}

/** Boot runs this so a school whose gateway account was dropped for a delete the process never finished gets it back. */
export async function seedAllLedgerAccounts(
  pool: Pick<Pool, 'query'>
): Promise<void> {
  await pool.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('seed_ledger_accounts', 0)),
            seed_ledger_accounts("id")
     FROM "organization"`
  );
}

/** The seeded gateway money account blocks deleting a school; an unused one is dropped first and put back if the delete fails, or at the next boot. */
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
