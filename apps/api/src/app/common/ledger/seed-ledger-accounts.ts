import type { Pool } from 'pg';

export async function seedLedgerAccounts(
  pool: Pick<Pool, 'query'>,
  organizationId: string
): Promise<void> {
  await pool.query('SELECT seed_ledger_accounts($1)', [organizationId]);
}
