import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type {
  Payment,
  PaymentListQuery,
  PaymentMethods,
  RecordingChild,
  RecordingPayer,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import {
  ActivityWriter,
  financeActor,
  paymentRecordedActivity,
} from '../../common/activity';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { uniqueViolation } from '../../common/db/unique-violation';
import { readPaymentMethods } from '../../common/school-setting/payment-methods';
import {
  LedgerPoster,
  receivableBalanceSql,
  schoolCurrency,
} from '../../common/ledger';
import {
  allocationShares,
  findPaymentByColumn,
  paymentProofState,
  writePayment,
  type ExistingPayment,
  type InsertOutcome,
  type ProofState,
} from '../../common/payments';
import { currentCampusSql, inScope } from '../../common/students';
import { findPayment, listPayments } from './kysely-payment-read.repository';
import {
  PaymentRepository,
  type PaymentPage,
  type PaymentScope,
  type NewRecordedPayment,
  type RecordingAccount,
  type RecordingPeople,
} from './payment.repository';

const PROVIDER_REFERENCE_KEY = 'payment_provider_reference_key';
const PROOF_FILE_KEY = 'payment_proof_file_key';

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
    private readonly poster: LedgerPoster,
    private readonly activity: ActivityWriter
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
    return findPaymentByColumn(this.db, {
      organizationId,
      column: 'reference',
      value: reference,
    });
  }

  findByProviderReference(
    organizationId: string,
    providerReference: string
  ): Promise<ExistingPayment | undefined> {
    return findPaymentByColumn(this.db, {
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

  proof(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofState> {
    return paymentProofState(this.db, { organizationId, userId, fileId });
  }

  async insert(input: NewRecordedPayment): Promise<InsertOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const outcome = await writePayment(trx, this.poster, input);
        if (outcome.status === 'recorded') {
          await this.recordActivity(trx, input, {
            paymentId: outcome.id,
            receiptNumber: outcome.receiptNumber,
          });
        }
        return outcome;
      });
    } catch (error) {
      return this.afterRace(error);
    }
  }

  private async recordActivity(
    trx: Kysely<DB>,
    input: NewRecordedPayment,
    recorded: { paymentId: string; receiptNumber: string }
  ): Promise<void> {
    const { paymentId } = recorded;
    const currency = await schoolCurrency(trx, input.organizationId);
    const allocations = await allocationShares(trx, {
      organizationId: input.organizationId,
      paymentId,
    });
    await this.activity.within(trx).recordMany(
      paymentRecordedActivity(
        financeActor(
          {
            organizationId: input.organizationId,
            user: { id: input.userId, name: input.userName },
          },
          currency
        ),
        {
          id: paymentId,
          receiptNumber: recorded.receiptNumber,
          payerName: input.payerName,
        },
        allocations
      )
    );
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
