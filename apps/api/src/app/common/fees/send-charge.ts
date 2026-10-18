import { sql, type Kysely } from 'kysely';
import type { JournalKind } from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { allocateDocumentNumber, formatDocumentNumber } from '../documents';
import type { LedgerPoster, PostInput } from '../ledger';
import { chargePostingLines } from './charge-posting';

export class ChargeAlreadyPosted extends Error {
  constructor(readonly number: string) {
    super(`Charge number ${number} was already posted`);
    this.name = 'ChargeAlreadyPosted';
  }
}

interface DraftCharge {
  id: string;
  organizationId: string;
  studentId: string;
  termId: string;
  campusId: string;
  kind: 'store' | 'adhoc';
  createdBy: string;
  request?: { reference: string; requestHash: string };
  lines: readonly {
    ledgerAccountId: string;
    description: string;
    amountMinor: number;
  }[];
}

export interface SendCharge {
  invoiceId: string;
  organizationId: string;
  studentId: string;
  campusId: string;
  receivableId: string;
  journalKind: Extract<JournalKind, 'invoice' | 'store' | 'adhoc'>;
  memo: string;
  lines: readonly { ledgerAccountId: string; amountMinor: number }[];
  today: string;
  actorId: string;
  year: number;
}

interface SentCharge {
  number: string;
  entryId: string;
}

export async function insertDraftCharge(
  trx: Kysely<DB>,
  draft: DraftCharge
): Promise<void> {
  await trx
    .insertInto('invoice')
    .values({
      id: draft.id,
      organization_id: draft.organizationId,
      student_id: draft.studentId,
      term_id: draft.termId,
      campus_id: draft.campusId,
      kind: draft.kind,
      status: 'draft',
      created_by: draft.createdBy,
      reference: draft.request?.reference ?? null,
      request_hash: draft.request?.requestHash ?? null,
    })
    .execute();
  await trx
    .insertInto('invoice_line')
    .values(
      draft.lines.map((line) => ({
        organization_id: draft.organizationId,
        invoice_id: draft.id,
        ledger_account_id: line.ledgerAccountId,
        description: line.description,
        amount_minor: String(line.amountMinor),
      }))
    )
    .execute();
}

export const chargePostInput = (
  input: SendCharge,
  number: string
): PostInput => ({
  organizationId: input.organizationId,
  reference: number,
  kind: input.journalKind,
  effectiveOn: input.today,
  memo: input.memo,
  postedBy: input.actorId,
  sourceId: input.invoiceId,
  lines: chargePostingLines({
    lines: input.lines,
    receivableId: input.receivableId,
    studentId: input.studentId,
    campusId: input.campusId,
  }),
});

export async function sendCharge(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  input: SendCharge
): Promise<SentCharge> {
  const { organizationId, year } = input;
  const value = await allocateDocumentNumber(trx, {
    organizationId,
    kind: 'invoice',
    year,
  });
  const number = formatDocumentNumber('invoice', year, value);
  const { entry, replayed } = await poster.post(
    trx,
    chargePostInput(input, number)
  );
  if (replayed) {
    throw new ChargeAlreadyPosted(number);
  }
  await trx
    .updateTable('invoice')
    .set({
      status: 'issued',
      number,
      issued_at: sql<Date>`now()`,
      issued_by: input.actorId,
      journal_entry_id: entry.id,
    })
    .where('id', '=', input.invoiceId)
    .where('organization_id', '=', organizationId)
    .where('status', '=', 'draft')
    .execute();
  return { number, entryId: entry.id };
}
