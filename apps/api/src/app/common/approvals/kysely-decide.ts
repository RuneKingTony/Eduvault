import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { DB } from '../../../db/db-types';

type DecidableTable =
  'adjustment' | 'payment_void' | 'stock_count' | 'student_discount';

interface DecisionTarget {
  table: DecidableTable;
  organizationId: string;
  id: string;
}

async function approveWaiting(
  db: Kysely<DB>,
  target: DecisionTarget,
  approval: { userId: string; journalEntryId?: string }
): Promise<boolean> {
  const entry =
    approval.journalEntryId === undefined
      ? sql``
      : sql`, journal_entry_id = ${approval.journalEntryId}`;
  const result = await sql`
    UPDATE ${sql.table(target.table)}
    SET status = 'approved', approved_by = ${approval.userId}, approved_at = ${new Date()}${entry}
    WHERE organization_id = ${target.organizationId} AND id = ${target.id}
      AND status = 'submitted'`.execute(db);
  return (result.numAffectedRows ?? 0n) > 0n;
}

async function rejectWaiting(
  db: Kysely<DB>,
  target: DecisionTarget,
  rejection: { userId: string; reason: string }
): Promise<boolean> {
  const result = await sql`
    UPDATE ${sql.table(target.table)}
    SET status = 'rejected', rejected_by = ${rejection.userId},
      rejected_at = ${new Date()}, rejection_reason = ${rejection.reason}
    WHERE organization_id = ${target.organizationId} AND id = ${target.id}
      AND status = 'submitted'`.execute(db);
  return (result.numAffectedRows ?? 0n) > 0n;
}

export async function countWaiting(
  db: Kysely<DB>,
  from: RawBuilder<unknown>
): Promise<number> {
  const { rows } = await sql<{ waiting: number }>`
    SELECT (count(*))::int AS waiting ${from}`.execute(db);
  return rows[0]?.waiting ?? 0;
}

export function decisionsFor(
  db: Kysely<DB>,
  owner: { table: DecidableTable; organizationId: string; userId: string }
) {
  const target = (id: string): DecisionTarget => ({
    table: owner.table,
    organizationId: owner.organizationId,
    id,
  });
  return {
    approve: (id: string, journalEntryId?: string) =>
      approveWaiting(db, target(id), { userId: owner.userId, journalEntryId }),
    reject: (id: string, reason: string) =>
      rejectWaiting(db, target(id), { userId: owner.userId, reason }),
  };
}
