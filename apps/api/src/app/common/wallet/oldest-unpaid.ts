import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import { receivableAccountIdSql, unpaidCharges } from '../ledger';

interface EntryNet {
  studentId: string;
  effectiveOn: string;
  netMinor: number;
}

/** Entries are oldest first within each child, the order `unpaidCharges` expects. */
export function oldestUnpaidDates(
  entries: readonly EntryNet[]
): Map<string, string> {
  const byChild = new Map<string, EntryNet[]>();
  for (const entry of entries) {
    const nets = byChild.get(entry.studentId) ?? [];
    nets.push(entry);
    byChild.set(entry.studentId, nets);
  }
  const oldest = new Map<string, string>();
  for (const [studentId, nets] of byChild) {
    const [first] = unpaidCharges(nets);
    if (first !== undefined) {
      oldest.set(studentId, first.effectiveOn);
    }
  }
  return oldest;
}

/** The date of each child's oldest charge that payments and credits have not yet covered, as the statement's unpaid list counts it. */
export async function oldestUnpaidByChild(
  db: Kysely<DB>,
  family: { organizationId: string; studentIds: readonly string[] }
): Promise<Map<string, string>> {
  if (family.studentIds.length === 0) {
    return new Map();
  }
  const { organizationId } = family;
  const { rows } = await sql<{
    student_id: string;
    effective_on: string;
    net: string;
  }>`
    SELECT jl.student_id, to_char(je.effective_on, 'YYYY-MM-DD') AS effective_on,
      sum(jl.debit_minor - jl.credit_minor)::text AS net
    FROM journal_line jl
    JOIN journal_entry je ON je.id = jl.entry_id AND je.organization_id = jl.organization_id
    LEFT JOIN invoice inv
      ON inv.journal_entry_id = je.id AND inv.organization_id = je.organization_id
    LEFT JOIN payment pay
      ON pay.journal_entry_id = je.id AND pay.organization_id = je.organization_id
    WHERE jl.organization_id = ${organizationId}
      AND jl.student_id IN (${sql.join(family.studentIds)})
      AND jl.ledger_account_id = ${receivableAccountIdSql(organizationId)}
      AND NOT EXISTS (
        SELECT 1 FROM store_sale ss
        WHERE ss.organization_id = je.organization_id
          AND (ss.invoice_id = inv.id OR ss.payment_id = pay.id)
      )
    GROUP BY jl.student_id, je.id, inv.id, pay.id
    ORDER BY jl.student_id, je.effective_on, je.sequence`.execute(db);
  return oldestUnpaidDates(
    rows.map((row) => ({
      studentId: row.student_id,
      effectiveOn: row.effective_on,
      netMinor: Number(row.net),
    }))
  );
}
