import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  type PaymentMethod,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { advisoryLock } from '../db/advisory-lock';
import { allocateDocumentNumber, formatDocumentNumber } from '../documents';
import { systemAccountId, type LedgerPoster } from '../ledger';
import { currentCampusSql } from '../students';
import { paymentPostingLines } from './payment-posting';

export interface ExistingPayment {
  id: string;
  receiptNumber: string;
  requestHash: string;
}

export interface NewPayment {
  organizationId: string;
  userId: string;
  year: number;
  reference: string;
  requestHash: string;
  payerGuardianId: string | null;
  payerName: string;
  moneyAccountId: string;
  ledgerAccountId: string;
  accountCampusId: string | null;
  method: PaymentMethod;
  providerReference: string | null;
  proofFileId: string | null;
  amountMinor: number;
  paidOn: string;
  allocations: { studentId: string; amountMinor: number }[];
}

export type InsertOutcome =
  | { status: 'recorded'; id: string; receiptNumber: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used' }
  | { status: 'provider_reference_used' }
  | { status: 'proof_taken' };

export async function findPaymentByColumn(
  db: Kysely<DB>,
  lookup: {
    organizationId: string;
    column: 'reference' | 'provider_reference';
    value: string;
  }
): Promise<ExistingPayment | undefined> {
  const { organizationId, column, value } = lookup;
  const row = await db
    .selectFrom('payment')
    .select(['id', 'receipt_number', 'request_hash'])
    .where('organization_id', '=', organizationId)
    .where(column, '=', value)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      receiptNumber: row.receipt_number,
      requestHash: row.request_hash,
    }
  );
}

async function campusesOf(
  trx: Kysely<DB>,
  organizationId: string,
  studentIds: readonly string[]
): Promise<Map<string, string>> {
  const { rows } = await sql<{ id: string; campus_id: string }>`
    SELECT st.id, ${currentCampusSql('st')} AS campus_id
    FROM student st
    WHERE st.organization_id = ${organizationId}
      AND st.id IN (${sql.join(studentIds)})`.execute(trx);
  return new Map(rows.map((row) => [row.id, row.campus_id]));
}

async function postEntry(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  payment: {
    input: NewPayment;
    receiptNumber: string;
    paymentId: string;
  }
): Promise<string> {
  const { input, receiptNumber, paymentId } = payment;
  const { organizationId } = input;
  const [campusOf, receivableId] = await Promise.all([
    campusesOf(
      trx,
      organizationId,
      input.allocations.map((row) => row.studentId)
    ),
    systemAccountId(trx, organizationId, FEES_RECEIVABLE_SYSTEM_KEY),
  ]);
  const { entry } = await poster.post(trx, {
    organizationId,
    reference: input.reference,
    kind: 'payment',
    effectiveOn: input.paidOn,
    memo: `Receipt ${receiptNumber} · ${input.payerName}`,
    postedBy: input.userId,
    sourceId: paymentId,
    lines: paymentPostingLines({
      moneyLedgerAccountId: input.ledgerAccountId,
      moneyCampusId: input.accountCampusId,
      receivableId,
      allocations: input.allocations,
      campusOf,
    }),
  });
  return entry.id;
}

async function create(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  input: NewPayment
): Promise<InsertOutcome> {
  const { organizationId } = input;
  const value = await allocateDocumentNumber(trx, {
    organizationId,
    kind: 'payment',
    year: input.year,
  });
  const receiptNumber = formatDocumentNumber('payment', input.year, value);
  const paymentId = randomUUID();
  const entryId = await postEntry(trx, poster, {
    input,
    receiptNumber,
    paymentId,
  });
  await trx
    .insertInto('payment')
    .values({
      id: paymentId,
      organization_id: organizationId,
      reference: input.reference,
      receipt_number: receiptNumber,
      payer_guardian_id: input.payerGuardianId,
      payer_name: input.payerName,
      money_account_id: input.moneyAccountId,
      method: input.method,
      provider_reference: input.providerReference,
      proof_file_id: input.proofFileId,
      amount_minor: input.amountMinor,
      paid_on: input.paidOn,
      request_hash: input.requestHash,
      journal_entry_id: entryId,
      created_by: input.userId,
    })
    .execute();
  await trx
    .insertInto('payment_allocation')
    .values(
      input.allocations.map((row) => ({
        payment_id: paymentId,
        organization_id: organizationId,
        student_id: row.studentId,
        amount_minor: row.amountMinor,
      }))
    )
    .execute();
  return { status: 'recorded', id: paymentId, receiptNumber };
}

export async function writePayment(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  input: NewPayment
): Promise<InsertOutcome> {
  await advisoryLock(trx, `payment:${input.organizationId}:${input.reference}`);
  const existing = await findPaymentByColumn(trx, {
    organizationId: input.organizationId,
    column: 'reference',
    value: input.reference,
  });
  if (existing !== undefined) {
    return existing.requestHash === input.requestHash
      ? { status: 'replayed', id: existing.id }
      : { status: 'reference_used' };
  }
  const journalClash = await trx
    .selectFrom('journal_entry')
    .select('id')
    .where('organization_id', '=', input.organizationId)
    .where('reference', '=', input.reference)
    .executeTakeFirst();
  if (journalClash !== undefined) {
    return { status: 'reference_used' };
  }
  return create(trx, poster, input);
}
