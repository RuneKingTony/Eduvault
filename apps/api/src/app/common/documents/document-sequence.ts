import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

type DocumentKind = 'admission';

/** The upsert locks the row, so concurrent callers get different numbers. */
export async function allocateDocumentNumber(
  db: Kysely<DB>,
  organizationId: string,
  kind: DocumentKind
): Promise<number> {
  const row = await db
    .insertInto('document_sequence')
    .values({
      organization_id: organizationId,
      kind,
      year: null,
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
  organizationId: string,
  kind: DocumentKind
): Promise<number> {
  const row = await db
    .selectFrom('document_sequence')
    .select('next_value')
    .where('organization_id', '=', organizationId)
    .where('kind', '=', kind)
    .where('year', 'is', null)
    .executeTakeFirst();
  return row?.next_value ?? 1;
}
