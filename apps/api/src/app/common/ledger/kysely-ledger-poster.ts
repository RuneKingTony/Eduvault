import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { journalKindSchema } from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import {
  ReferenceClashError,
  assertBalancedLines,
  type PostInput,
  type PostResult,
  type PostedEntry,
} from './ledger-lines';

interface EntryRow {
  id: string;
  reference: string;
  kind: string;
  effective_on: string;
}

const toEntry = (row: EntryRow): PostedEntry => ({
  id: row.id,
  reference: row.reference,
  kind: journalKindSchema.parse(row.kind),
  effectiveOn: row.effective_on,
});

const day = sql<string>`to_char(effective_on, 'YYYY-MM-DD')`.as('effective_on');

@Injectable()
export class LedgerPoster {
  async post(trx: Kysely<DB>, input: PostInput): Promise<PostResult> {
    assertBalancedLines(input.lines);
    const inserted = await trx
      .insertInto('journal_entry')
      .values({
        organization_id: input.organizationId,
        reference: input.reference,
        kind: input.kind,
        effective_on: input.effectiveOn,
        memo: input.memo ?? null,
        posted_by: input.postedBy,
        source_id: input.sourceId ?? null,
        reverses_entry_id: input.reversesEntryId ?? null,
      })
      .onConflict((conflict) =>
        conflict.columns(['organization_id', 'reference']).doNothing()
      )
      .returning(['id', 'reference', 'kind', day])
      .executeTakeFirst();
    if (inserted === undefined) {
      const existing = await trx
        .selectFrom('journal_entry')
        .select(['id', 'reference', 'kind', day])
        .where('organization_id', '=', input.organizationId)
        .where('reference', '=', input.reference)
        .executeTakeFirstOrThrow();
      return { entry: toEntry(existing), replayed: true };
    }
    await trx
      .insertInto('journal_line')
      .values(
        input.lines.map((line) => ({
          organization_id: input.organizationId,
          entry_id: inserted.id,
          ledger_account_id: line.ledgerAccountId,
          student_id: line.studentId ?? null,
          campus_id: line.campusId ?? null,
          debit_minor: line.debitMinor,
          credit_minor: line.creditMinor,
        }))
      )
      .execute();
    return { entry: toEntry(inserted), replayed: false };
  }

  /** For a posting that happens once per request: a reference already in the journal is a clash, never a replay. */
  async postOnce(trx: Kysely<DB>, input: PostInput): Promise<PostedEntry> {
    const { entry, replayed } = await this.post(trx, input);
    if (replayed) {
      throw new ReferenceClashError(input.reference);
    }
    return entry;
  }
}
