import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import {
  BAD_DEBT_SYSTEM_KEY,
  DISCOUNTS_GIVEN_SYSTEM_KEY,
  FEES_RECEIVABLE_SYSTEM_KEY,
  FEE_INCOME_SYSTEM_KEY,
  adjustmentKindSchema,
  approvalStatusSchema,
  type Adjustment,
  type AdjustmentKind,
  type AdjustmentListQuery,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { ActivityWriter, type ActivityRecorder } from '../../common/activity';
import {
  decisionsFor,
  isApprovalOn,
  type WaitingApproval,
} from '../../common/approvals';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
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
import {
  currentCampusSql,
  inScope,
  toStudentIdentity,
  type StudentIdentityRow,
} from '../../common/students';
import {
  AdjustmentRepository,
  type AdjustmentPage,
  type AdjustmentPost,
  type AdjustmentRecord,
  type AdjustmentScope,
  type LockedAdjustment,
  type AdjustmentTx,
  type CreditAccountCheck,
  type MoneyAccountPosting,
  type NewAdjustment,
  type RefundAccountCheck,
  type SentChargeCheck,
  type StudentFacts,
  type SystemAccounts,
} from './adjustment.repository';
import {
  findAdjustment,
  listAdjustments,
  waitingAdjustments,
} from './kysely-adjustment-read.repository';

interface AdjustmentRow {
  id: string;
  number: string;
  kind: string;
  student_id: string;
  invoice_id: string | null;
  ledger_account_id: string | null;
  money_account_id: string | null;
  amount_minor: string;
  reason: string;
  status: string;
  created_by: string | null;
}

const toRecord = (row: AdjustmentRow): AdjustmentRecord => ({
  id: row.id,
  number: row.number,
  kind: adjustmentKindSchema.parse(row.kind),
  studentId: row.student_id,
  invoiceId: row.invoice_id,
  ledgerAccountId: row.ledger_account_id,
  moneyAccountId: row.money_account_id,
  amountMinor: Number(row.amount_minor),
  reason: row.reason,
  status: approvalStatusSchema.parse(row.status),
  createdBy: row.created_by,
});

class KyselyAdjustmentTx implements AdjustmentTx {
  readonly activity: ActivityRecorder;
  private readonly decisions: ReturnType<typeof decisionsFor>;

  constructor(
    private readonly trx: Kysely<DB>,
    private readonly deps: { poster: LedgerPoster; activity: ActivityRecorder },
    private readonly who: { scope: AdjustmentScope; userId: string }
  ) {
    this.activity = deps.activity;
    this.decisions = decisionsFor(trx, {
      table: 'adjustment',
      organizationId: who.scope.organizationId,
      userId: who.userId,
    });
  }

  private get organizationId(): string {
    return this.who.scope.organizationId;
  }

  async lockStudent(studentId: string): Promise<StudentFacts | undefined> {
    const inside = inScope(currentCampusSql('st'), this.who.scope.campusScope);
    const locked = await sql<{
      id: string;
      first_name: string;
      last_name: string;
      admission_number: string;
      campus_id: string;
    }>`
      SELECT st.id, st.first_name, st.last_name, st.admission_number,
        ${currentCampusSql('st')} AS campus_id
      FROM student st
      WHERE st.id = ${studentId} AND st.organization_id = ${this.organizationId}
        AND ${inside}
      FOR UPDATE OF st`.execute(this.trx);
    const student = locked.rows[0];
    if (student === undefined) {
      return undefined;
    }
    const { rows } = await sql<{ balance: string }>`
      SELECT (${receivableBalanceSql('st')})::text AS balance
      FROM student st
      WHERE st.id = ${studentId} AND st.organization_id = ${this.organizationId}`.execute(
      this.trx
    );
    return {
      id: student.id,
      name: `${student.first_name} ${student.last_name}`,
      admissionNumber: student.admission_number,
      campusId: student.campus_id,
      balanceMinor: Number(rows[0]?.balance ?? 0),
    };
  }

  currency(): Promise<string> {
    return schoolCurrency(this.trx, this.organizationId);
  }

  approvalOn(kind: AdjustmentKind): Promise<boolean> {
    return isApprovalOn(this.trx, this.organizationId, kind);
  }

  async sentCharge(
    studentId: string,
    invoiceId: string
  ): Promise<SentChargeCheck> {
    const { rows } = await sql<{ student_id: string; status: string }>`
      SELECT i.student_id, i.status
      FROM invoice i
      JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
      WHERE i.id = ${invoiceId} AND i.organization_id = ${this.organizationId}
        AND ${inScope(currentCampusSql('st'), this.who.scope.campusScope)}`.execute(
      this.trx
    );
    const invoice = rows[0];
    if (invoice === undefined) {
      return 'missing';
    }
    return invoice.student_id === studentId && invoice.status === 'issued'
      ? 'ok'
      : 'not_sent';
  }

  async creditAccount(
    ledgerAccountId: string | null
  ): Promise<CreditAccountCheck> {
    if (ledgerAccountId === null) {
      return {
        status: 'ok',
        ledgerAccountId: await systemAccountId(
          this.trx,
          this.organizationId,
          DISCOUNTS_GIVEN_SYSTEM_KEY
        ),
      };
    }
    const row = await this.trx
      .selectFrom('ledger_account')
      .select(['id', 'system_key', 'type', 'retired_at'])
      .where('organization_id', '=', this.organizationId)
      .where('id', '=', ledgerAccountId)
      .executeTakeFirst();
    if (row === undefined) {
      return { status: 'missing' };
    }
    const allowed =
      row.system_key === DISCOUNTS_GIVEN_SYSTEM_KEY ||
      (row.type === 'income' &&
        row.retired_at === null &&
        row.system_key !== FEE_INCOME_SYSTEM_KEY);
    return allowed
      ? { status: 'ok', ledgerAccountId: row.id }
      : { status: 'not_allowed' };
  }

  async refundAccount(moneyAccountId: string): Promise<RefundAccountCheck> {
    const row = await this.trx
      .selectFrom('money_account')
      .select(['ledger_account_id', 'campus_id', 'kind', 'retired_at'])
      .where('organization_id', '=', this.organizationId)
      .where('id', '=', moneyAccountId)
      .where((eb) =>
        inCampusScope(eb, 'money_account.campus_id', {
          scope: this.who.scope.campusScope,
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

  async moneyAccountPosting(
    moneyAccountId: string
  ): Promise<MoneyAccountPosting | undefined> {
    const row = await this.trx
      .selectFrom('money_account')
      .select(['ledger_account_id', 'campus_id', 'kind', 'retired_at'])
      .where('organization_id', '=', this.organizationId)
      .where('id', '=', moneyAccountId)
      .executeTakeFirst();
    return (
      row && {
        ledgerAccountId: row.ledger_account_id,
        campusId: row.campus_id,
        live: row.retired_at === null && row.kind !== 'gateway',
      }
    );
  }

  async systemAccounts(): Promise<SystemAccounts> {
    const [receivableId, badDebtId] = await Promise.all([
      systemAccountId(
        this.trx,
        this.organizationId,
        FEES_RECEIVABLE_SYSTEM_KEY
      ),
      systemAccountId(this.trx, this.organizationId, BAD_DEBT_SYSTEM_KEY),
    ]);
    return { receivableId, badDebtId };
  }

  async nextNumber(year: number): Promise<string> {
    const value = await allocateDocumentNumber(this.trx, {
      organizationId: this.organizationId,
      kind: 'adjustment',
      year,
    });
    return formatDocumentNumber('adjustment', year, value);
  }

  async post(entry: AdjustmentPost): Promise<string> {
    const { entry: posted } = await this.deps.poster.post(this.trx, {
      ...entry,
      organizationId: this.organizationId,
      postedBy: this.who.userId,
    });
    return posted.id;
  }

  async insert(input: NewAdjustment): Promise<void> {
    const approved = input.approvedEntryId !== null;
    await this.trx
      .insertInto('adjustment')
      .values({
        id: input.id,
        organization_id: this.organizationId,
        number: input.number,
        kind: input.kind,
        student_id: input.studentId,
        invoice_id: input.invoiceId,
        ledger_account_id: input.ledgerAccountId,
        money_account_id: input.moneyAccountId,
        amount_minor: input.amountMinor,
        reason: input.reason,
        status: approved ? 'approved' : 'submitted',
        created_by: this.who.userId,
        approved_by: null,
        approved_at: approved ? new Date() : null,
        journal_entry_id: input.approvedEntryId,
      })
      .execute();
  }

  async lockAdjustment(id: string): Promise<LockedAdjustment | undefined> {
    const { rows } = await sql<AdjustmentRow & Omit<StudentIdentityRow, 'id'>>`
      SELECT a.id, a.number, a.kind, a.student_id, a.invoice_id,
        a.ledger_account_id, a.money_account_id, a.amount_minor::text AS amount_minor,
        a.reason, a.status, a.created_by, st.first_name, st.last_name,
        ${currentCampusSql('st')} AS campus_id
      FROM adjustment a
      JOIN student st ON st.id = a.student_id AND st.organization_id = a.organization_id
      WHERE a.id = ${id} AND a.organization_id = ${this.organizationId}
        AND ${inScope(currentCampusSql('st'), this.who.scope.campusScope)}
      FOR UPDATE OF a`.execute(this.trx);
    const row = rows[0];
    return (
      row && {
        ...toRecord(row),
        student: toStudentIdentity({ ...row, id: row.student_id }),
      }
    );
  }

  approve(id: string, entryId: string): Promise<boolean> {
    return this.decisions.approve(id, entryId);
  }

  reject(id: string, reason: string): Promise<boolean> {
    return this.decisions.reject(id, reason);
  }
}

@Injectable()
export class KyselyAdjustmentRepository extends AdjustmentRepository {
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

  withTx<T>(
    scope: AdjustmentScope,
    userId: string,
    work: (tx: AdjustmentTx) => Promise<T>
  ): Promise<T> {
    return this.db.transaction().execute((trx) =>
      work(
        new KyselyAdjustmentTx(
          trx,
          { poster: this.poster, activity: this.activity.within(trx) },
          {
            scope,
            userId,
          }
        )
      )
    );
  }

  findById(
    scope: AdjustmentScope,
    id: string
  ): Promise<Adjustment | undefined> {
    return findAdjustment(this.db, scope, id);
  }

  list(
    scope: AdjustmentScope,
    query: AdjustmentListQuery
  ): Promise<AdjustmentPage> {
    return listAdjustments(this.db, scope, query);
  }

  waiting(scope: AdjustmentScope): Promise<WaitingApproval[]> {
    return waitingAdjustments(this.db, scope);
  }
}
