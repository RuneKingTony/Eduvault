import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  type Payment,
  type PaymentListQuery,
  type PaymentMethods,
  type RecordingChild,
  type RecordingPayer,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { uniqueViolation } from '../../common/db/unique-violation';
import { readPaymentMethods } from '../../common/school-setting/payment-methods';
import {
  allocateDocumentNumber,
  formatDocumentNumber,
} from '../../common/documents';
import {
  LedgerPoster,
  receivableBalanceSql,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import { currentCampusSql, inScope } from '../../common/students';
import { findPayment, listPayments } from './kysely-payment-read.repository';
import { paymentPostingLines } from './payment-posting';
import {
  PaymentRepository,
  type ExistingPayment,
  type InsertOutcome,
  type NewPayment,
  type PaymentPage,
  type PaymentScope,
  type ProofCheck,
  type RecordingAccount,
  type RecordingPeople,
} from './payment.repository';

const PROVIDER_REFERENCE_KEY = 'payment_provider_reference_key';
const PROOF_FILE_KEY = 'payment_proof_file_key';

async function findByColumn(
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

interface PersonRow {
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  balance: string;
}

const toChild = (row: PersonRow): RecordingChild => ({
  studentId: row.student_id,
  name: `${row.first_name} ${row.last_name}`,
  admissionNumber: row.admission_number,
  owesMinor: Number(row.balance),
});

@Injectable()
export class KyselyPaymentRepository extends PaymentRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster
  ) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  list(scope: PaymentScope, query: PaymentListQuery): Promise<PaymentPage> {
    return listPayments(this.db, scope, query);
  }

  find(
    scope: PaymentScope,
    id: string
  ): Promise<Omit<Payment, 'currency'> | undefined> {
    return findPayment(this.db, scope, id);
  }

  findByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingPayment | undefined> {
    return findByColumn(this.db, {
      organizationId,
      column: 'reference',
      value: reference,
    });
  }

  findByProviderReference(
    organizationId: string,
    providerReference: string
  ): Promise<ExistingPayment | undefined> {
    return findByColumn(this.db, {
      organizationId,
      column: 'provider_reference',
      value: providerReference,
    });
  }

  paymentMethods(organizationId: string): Promise<PaymentMethods> {
    return readPaymentMethods(this.db, organizationId);
  }

  async recordingAccount(
    scope: PaymentScope,
    moneyAccountId: string
  ): Promise<RecordingAccount> {
    const row = await this.db
      .selectFrom('money_account')
      .select(['ledger_account_id', 'campus_id', 'kind', 'retired_at'])
      .where('organization_id', '=', scope.organizationId)
      .where('id', '=', moneyAccountId)
      .where((eb) =>
        inCampusScope(eb, 'money_account.campus_id', {
          scope: scope.campusScope,
          nullMeans: 'all',
        })
      )
      .executeTakeFirst();
    if (row === undefined) {
      return { status: 'missing' };
    }
    if (row.kind === 'gateway') {
      return { status: 'gateway' };
    }
    if (row.retired_at !== null) {
      return { status: 'retired' };
    }
    return {
      status: 'ok',
      ledgerAccountId: row.ledger_account_id,
      campusId: row.campus_id,
    };
  }

  async guardianName(
    scope: PaymentScope,
    guardianId: string
  ): Promise<string | undefined> {
    const { rows } = await sql<{ full_name: string }>`
      SELECT g.full_name FROM guardian g
      WHERE g.id = ${guardianId}
        AND g.organization_id = ${scope.organizationId}
        AND EXISTS (
          SELECT 1 FROM guardian_student gs
          JOIN student st ON st.id = gs.student_id AND st.organization_id = gs.organization_id
          WHERE gs.guardian_id = g.id AND gs.organization_id = g.organization_id
            AND ${inScope(currentCampusSql('st'), scope.campusScope)})`.execute(
      this.db
    );
    return rows[0]?.full_name;
  }

  async studentsInScope(
    scope: PaymentScope,
    studentIds: readonly string[]
  ): Promise<string[]> {
    if (studentIds.length === 0) {
      return [];
    }
    const { rows } = await sql<{ id: string }>`
      SELECT st.id FROM student st
      WHERE st.organization_id = ${scope.organizationId}
        AND st.id IN (${sql.join(studentIds)})
        AND ${inScope(currentCampusSql('st'), scope.campusScope)}`.execute(
      this.db
    );
    return rows.map((row) => row.id);
  }

  async proof(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofCheck> {
    const file = await this.db
      .selectFrom('file_object')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('uploaded_by', '=', userId)
      .where('id', '=', fileId)
      .where('kind', '=', 'payment_proof')
      .executeTakeFirst();
    if (file === undefined) {
      return 'missing';
    }
    const attached = await this.db
      .selectFrom('payment')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('proof_file_id', '=', fileId)
      .executeTakeFirst();
    return attached === undefined ? 'free' : 'taken';
  }

  async insert(input: NewPayment): Promise<InsertOutcome> {
    try {
      return await this.db
        .transaction()
        .execute((trx) => this.insertIn(trx, input));
    } catch (error) {
      return this.afterRace(error);
    }
  }

  private afterRace(error: unknown): InsertOutcome {
    const constraint = uniqueViolation(error);
    if (constraint === PROVIDER_REFERENCE_KEY) {
      return { status: 'provider_reference_used' };
    }
    if (constraint === PROOF_FILE_KEY) {
      return { status: 'proof_taken' };
    }
    throw error;
  }

  private async insertIn(
    trx: Kysely<DB>,
    input: NewPayment
  ): Promise<InsertOutcome> {
    const lockKey = `payment:${input.organizationId}:${input.reference}`;
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(
      trx
    );
    const existing = await findByColumn(trx, {
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
    return this.create(trx, input);
  }

  private async create(
    trx: Kysely<DB>,
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
    const entryId = await this.postEntry(trx, input, {
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
    return { status: 'recorded', id: paymentId };
  }

  private async postEntry(
    trx: Kysely<DB>,
    input: NewPayment,
    issued: { receiptNumber: string; paymentId: string }
  ): Promise<string> {
    const { organizationId } = input;
    const [campusOf, receivableId] = await Promise.all([
      campusesOf(
        trx,
        organizationId,
        input.allocations.map((row) => row.studentId)
      ),
      systemAccountId(trx, organizationId, FEES_RECEIVABLE_SYSTEM_KEY),
    ]);
    const { entry } = await this.poster.post(trx, {
      organizationId,
      reference: input.reference,
      kind: 'payment',
      effectiveOn: input.paidOn,
      memo: `Receipt ${issued.receiptNumber} · ${input.payerName}`,
      postedBy: input.userId,
      sourceId: issued.paymentId,
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

  async recordingPeople(scope: PaymentScope): Promise<RecordingPeople> {
    const inside = inScope(currentCampusSql('st'), scope.campusScope);
    const { rows } = await sql<PersonRow & { archived: boolean }>`
      SELECT st.id AS student_id, st.first_name, st.last_name, st.admission_number,
        (st.archived_at IS NOT NULL) AS archived,
        (${receivableBalanceSql('st')})::text AS balance
      FROM student st
      WHERE st.organization_id = ${scope.organizationId} AND ${inside}
      ORDER BY st.first_name, st.last_name, st.id`.execute(this.db);
    const students = rows
      .filter((row) => !row.archived || Number(row.balance) !== 0)
      .map((row) => toChild(row));
    return { students, payers: await this.payers(scope, students) };
  }

  private async payers(
    scope: PaymentScope,
    students: readonly RecordingChild[]
  ): Promise<RecordingPayer[]> {
    const byStudent = new Map(
      students.map((child) => [child.studentId, child])
    );
    const { rows } = await sql<{
      guardian_id: string;
      full_name: string;
      student_id: string;
    }>`
      SELECT gs.guardian_id, g.full_name, gs.student_id
      FROM guardian_student gs
      JOIN guardian g ON g.id = gs.guardian_id AND g.organization_id = gs.organization_id
      JOIN student st ON st.id = gs.student_id AND st.organization_id = gs.organization_id
      WHERE gs.organization_id = ${scope.organizationId}
        AND ${inScope(currentCampusSql('st'), scope.campusScope)}
      ORDER BY g.full_name, g.id`.execute(this.db);
    const payers = new Map<string, RecordingPayer>();
    for (const row of rows) {
      const child = byStudent.get(row.student_id);
      if (child !== undefined) {
        const payer = payers.get(row.guardian_id) ?? {
          guardianId: row.guardian_id,
          name: row.full_name,
          children: [],
        };
        payer.children.push(child);
        payers.set(row.guardian_id, payer);
      }
    }
    return [...payers.values()].map((payer) => ({
      ...payer,
      children: payer.children.toSorted((a, b) => a.name.localeCompare(b.name)),
    }));
  }
}
