import { walletFigures } from '@eduvault/shared';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { DB } from '../../../db/db-types';
import { earmarksByChild, walletBalance } from './wallet-balance';

type SqlRef = string | RawBuilder<unknown>;

export const heldMoneySql = (
  organizationId: SqlRef,
  walletId: SqlRef
): RawBuilder<string> => sql<string>`(
  COALESCE((
    SELECT SUM(r.amount_minor) FROM wallet_refund r
    WHERE r.organization_id = ${organizationId} AND r.wallet_id = ${walletId}
      AND r.status = 'submitted'
  ), 0)
  + COALESCE((
    SELECT SUM(t.amount_minor) FROM wallet_topup_cancellation c
    JOIN wallet_topup t ON t.id = c.wallet_topup_id AND t.organization_id = c.organization_id
    WHERE c.organization_id = ${organizationId} AND t.wallet_id = ${walletId}
      AND c.status = 'submitted'
  ), 0)
)`;

export async function heldMoney(
  db: Kysely<DB>,
  wallet: { organizationId: string; walletId: string }
): Promise<number> {
  const { rows } = await sql<{ held: string }>`
    SELECT ${heldMoneySql(wallet.organizationId, wallet.walletId)}::text AS held`.execute(
    db
  );
  return Number(rows[0]?.held ?? 0);
}

export async function walletFreeMoney(
  trx: Kysely<DB>,
  wallet: { organizationId: string; walletId: string; guardianId: string }
): Promise<{ freeMinor: number; marked: Map<string, number> }> {
  const { organizationId, walletId, guardianId } = wallet;
  const [balance, marked, held] = await Promise.all([
    walletBalance(trx, { organizationId, guardianId }),
    earmarksByChild(trx, { organizationId, walletId }),
    heldMoney(trx, { organizationId, walletId }),
  ]);
  const { freeMinor } = walletFigures(balance, [...marked.values()], held);
  return { freeMinor, marked };
}
