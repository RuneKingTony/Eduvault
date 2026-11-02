import { sql, type Kysely, type RawBuilder } from 'kysely';
import { STUDENT_WALLETS_SYSTEM_KEY } from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';

export const walletsAccountIdSql = (
  organizationId: string | RawBuilder<unknown>
): RawBuilder<string> => sql<string>`(
  select la.id from ledger_account la
  where la.organization_id = ${organizationId}
    and la.system_key = ${STUDENT_WALLETS_SYSTEM_KEY}
)`;

export async function walletBalance(
  db: Kysely<DB>,
  family: { organizationId: string; guardianId: string }
): Promise<number> {
  const { rows } = await sql<{ balance: string }>`
    SELECT COALESCE(SUM(jl.credit_minor - jl.debit_minor), 0)::text AS balance
    FROM journal_line jl
    WHERE jl.organization_id = ${family.organizationId}
      AND jl.family_id = ${family.guardianId}
      AND jl.ledger_account_id = ${walletsAccountIdSql(family.organizationId)}`.execute(
    db
  );
  return Number(rows[0]?.balance ?? 0);
}

export async function earmarkTotal(
  db: Kysely<DB>,
  wallet: { organizationId: string; walletId: string }
): Promise<number> {
  const { rows } = await sql<{ total: string }>`
    SELECT COALESCE(SUM(e.delta_minor), 0)::text AS total
    FROM wallet_earmark e
    WHERE e.organization_id = ${wallet.organizationId}
      AND e.wallet_id = ${wallet.walletId}`.execute(db);
  return Number(rows[0]?.total ?? 0);
}

export async function earmarksByChild(
  db: Kysely<DB>,
  wallet: { organizationId: string; walletId: string }
): Promise<Map<string, number>> {
  const { rows } = await sql<{ student_id: string; earmark: string }>`
    SELECT e.student_id, SUM(e.delta_minor)::text AS earmark
    FROM wallet_earmark e
    WHERE e.organization_id = ${wallet.organizationId}
      AND e.wallet_id = ${wallet.walletId}
    GROUP BY e.student_id`.execute(db);
  return new Map(rows.map((row) => [row.student_id, Number(row.earmark)]));
}
