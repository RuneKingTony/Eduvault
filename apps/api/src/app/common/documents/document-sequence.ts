import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export type DocumentKind =
  | 'admission'
  | 'invoice'
  | 'payment'
  | 'billing_run'
  | 'adjustment'
  | 'store_sale'
  | 'delivery'
  | 'stock_count';

interface DocumentSequence {
  organizationId: string;
  kind: DocumentKind;
  /** Null for admission numbers, which never restart; otherwise the Lagos year. */
  year: number | null;
}

/** The upsert locks the row, so concurrent callers get different numbers. */
export async function allocateDocumentNumber(
  db: Kysely<DB>,
  { organizationId, kind, year }: DocumentSequence
): Promise<number> {
  const row = await db
    .insertInto('document_sequence')
    .values({
      organization_id: organizationId,
      kind,
      year,
      next_value: 2,
    })
    .onConflict((conflict) =>
      conflict
        .columns(['organization_id', 'kind', 'year'])
        .doUpdateSet((eb) => ({
          next_value: eb('document_sequence.next_value', '+', 1),
        }))
    )
    .returning(sql<number>`next_value - 1`.as('value'))
    .executeTakeFirstOrThrow();
  return row.value;
}

export async function peekDocumentNumber(
  db: Kysely<DB>,
  { organizationId, kind, year }: DocumentSequence
): Promise<number> {
  const row = await db
    .selectFrom('document_sequence')
    .select('next_value')
    .where('organization_id', '=', organizationId)
    .where('kind', '=', kind)
    .where('year', year === null ? 'is' : '=', year)
    .executeTakeFirst();
  return row?.next_value ?? 1;
}
