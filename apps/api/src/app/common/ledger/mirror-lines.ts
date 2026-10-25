import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import type { LedgerLine } from './ledger-lines';

/** Copies the original's own lines, never today's campus, so a later move cannot change what is reversed. */
export function mirrorLines(original: readonly LedgerLine[]): LedgerLine[] {
  return original.map((line) => ({
    ledgerAccountId: line.ledgerAccountId,
    studentId: line.studentId ?? null,
    familyId: line.familyId ?? null,
    campusId: line.campusId ?? null,
    debitMinor: line.creditMinor,
    creditMinor: line.debitMinor,
  }));
}

export async function entryLines(
  db: Kysely<DB>,
  entry: { organizationId: string; entryId: string }
): Promise<LedgerLine[]> {
  const rows = await db
    .selectFrom('journal_line')
    .select([
      'ledger_account_id',
      'student_id',
      'family_id',
      'campus_id',
      'debit_minor',
      'credit_minor',
    ])
    .where('organization_id', '=', entry.organizationId)
    .where('entry_id', '=', entry.entryId)
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    ledgerAccountId: row.ledger_account_id,
    studentId: row.student_id,
    familyId: row.family_id,
    campusId: row.campus_id,
    debitMinor: Number(row.debit_minor),
    creditMinor: Number(row.credit_minor),
  }));
}
