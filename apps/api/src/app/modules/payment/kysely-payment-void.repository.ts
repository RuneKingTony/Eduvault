import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import {
  approvalStatusSchema,
  paymentStatusSchema,
  type PaymentStatus,
  type PaymentVoidItem,
  type PaymentVoidListQuery,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import {
  FORMER_MEMBER_NAME,
  countWaiting,
  decisionsFor,
  isApprovalOn,
  type WaitingApproval,
} from '../../common/approvals';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { iso } from '../../common/db/rows';
import { LedgerPoster, type LedgerLine } from '../../common/ledger';
import {
  allAllocationsInScopeSql,
  anyAllocationInScopeSql,
  currentCampusSql,
  inScope,
} from '../../common/students';
import type { PaymentScope } from './payment.repository';
import {
  PaymentVoidRepository,
  type PaymentVoidTx,
  type VoidPage,
  type VoidPost,
  type VoidRecord,
  type VoidablePayment,
} from './payment-void.repository';

interface PaymentRow {
  id: string;
  receipt_number: string;
  reference: string;
  payer_name: string;
  amount_minor: string;
  status: string;
  paid_on: string;
  journal_entry_id: string;
  every_in_scope: boolean;
}

const toVoidable = (row: PaymentRow): VoidablePayment => ({
  id: row.id,
  receiptNumber: row.receipt_number,
  reference: row.reference,
  payerName: row.payer_name,
  amountMinor: Number(row.amount_minor),
  status: paymentStatusSchema.parse(row.status),
  paidOn: row.paid_on,
  entryId: row.journal_entry_id,
  everyAllocationInScope: row.every_in_scope,
  storeSale: null,
});

interface VoidRow extends PaymentRow {
  void_id: string;
  void_status: string;
  void_reason: string;
  void_created_by: string | null;
}

class KyselyVoidTx implements PaymentVoidTx {
  private readonly decisions: ReturnType<typeof decisionsFor>;

  constructor(
    private readonly trx: Kysely<DB>,
    private readonly poster: LedgerPoster,
    private readonly who: { scope: PaymentScope; userId: string }
  ) {
    this.decisions = decisionsFor(trx, {
      table: 'payment_void',
      organizationId: who.scope.organizationId,
      userId: who.userId,
    });
  }

  private get organizationId(): string {
    return this.who.scope.organizationId;
  }

  async lockPayment(paymentId: string): Promise<VoidablePayment | undefined> {
    const { rows } = await sql<PaymentRow>`
      SELECT p.id, p.receipt_number, p.reference, p.payer_name,
        p.amount_minor::text AS amount_minor, p.status,
        to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, p.journal_entry_id,
        ${allAllocationsInScopeSql('p', this.who.scope.campusScope)} AS every_in_scope
      FROM payment p
      WHERE p.id = ${paymentId} AND p.organization_id = ${this.organizationId}
        AND ${anyAllocationInScopeSql('p', this.who.scope.campusScope)}
      FOR UPDATE OF p`.execute(this.trx);
    return rows[0] && toVoidable(rows[0]);
  }

  async hasOpenVoid(paymentId: string): Promise<boolean> {
    const row = await this.trx
      .selectFrom('payment_void')
      .select('id')
      .where('organization_id', '=', this.organizationId)
      .where('payment_id', '=', paymentId)
      .where('status', 'in', ['submitted', 'approved'])
      .executeTakeFirst();
    return row !== undefined;
  }

  approvalOn(): Promise<boolean> {
    return isApprovalOn(this.trx, this.organizationId, 'payment_void');
  }

  async originalLines(entryId: string): Promise<LedgerLine[]> {
    const rows = await this.trx
      .selectFrom('journal_line')
      .select([
        'ledger_account_id',
        'student_id',
        'campus_id',
        'debit_minor',
        'credit_minor',
      ])
      .where('organization_id', '=', this.organizationId)
      .where('entry_id', '=', entryId)
      .orderBy('id')
      .execute();
    return rows.map((row) => ({
      ledgerAccountId: row.ledger_account_id,
      studentId: row.student_id,
      campusId: row.campus_id,
      debitMinor: Number(row.debit_minor),
      creditMinor: Number(row.credit_minor),
    }));
  }

  async post(entry: VoidPost): Promise<string> {
    const { entry: posted } = await this.poster.post(this.trx, {
      ...entry,
      organizationId: this.organizationId,
      postedBy: this.who.userId,
    });
    return posted.id;
  }

  async insertSubmitted(input: {
    paymentId: string;
    reason: string;
  }): Promise<string> {
    const row = await this.trx
      .insertInto('payment_void')
      .values({
        organization_id: this.organizationId,
        payment_id: input.paymentId,
        reason: input.reason,
        created_by: this.who.userId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async insertApproved(input: {
    paymentId: string;
    reason: string;
    entryId: string;
  }): Promise<string> {
    const row = await this.trx
      .insertInto('payment_void')
      .values({
        organization_id: this.organizationId,
        payment_id: input.paymentId,
        reason: input.reason,
        status: 'approved',
        created_by: this.who.userId,
        approved_by: null,
        approved_at: new Date(),
        journal_entry_id: input.entryId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async setPaymentStatus(
    paymentId: string,
    status: PaymentStatus
  ): Promise<void> {
    await this.trx
      .updateTable('payment')
      .set({ status })
      .where('organization_id', '=', this.organizationId)
      .where('id', '=', paymentId)
      .execute();
  }

  async lockVoid(voidId: string): Promise<VoidRecord | undefined> {
    const { rows } = await sql<VoidRow>`
      SELECT v.id AS void_id, v.status AS void_status, v.reason AS void_reason,
        v.created_by AS void_created_by,
        p.id, p.receipt_number, p.reference, p.payer_name,
        p.amount_minor::text AS amount_minor, p.status,
        to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, p.journal_entry_id,
        ${allAllocationsInScopeSql('p', this.who.scope.campusScope)} AS every_in_scope
      FROM payment_void v
      JOIN payment p ON p.id = v.payment_id AND p.organization_id = v.organization_id
      WHERE v.id = ${voidId} AND v.organization_id = ${this.organizationId}
        AND ${anyAllocationInScopeSql('p', this.who.scope.campusScope)}
      FOR UPDATE OF v`.execute(this.trx);
    const row = rows[0];
    return (
      row && {
        id: row.void_id,
        status: approvalStatusSchema.parse(row.void_status),
        reason: row.void_reason,
        createdBy: row.void_created_by,
        payment: toVoidable(row),
      }
    );
  }

  approve(voidId: string, entryId: string): Promise<boolean> {
    return this.decisions.approve(voidId, entryId);
  }

  reject(voidId: string, reason: string): Promise<boolean> {
    return this.decisions.reject(voidId, reason);
  }
}

interface ItemRow {
  id: string;
  status: string;
  reason: string;
  created_by_name: string | null;
  approved_by_name: string | null;
  rejection_reason: string | null;
  created_at: Date;
  payment_id: string;
  receipt_number: string;
  payer_name: string;
  amount_minor: string;
  total_rows?: number;
}

const toItem = (row: ItemRow): PaymentVoidItem => ({
  id: row.id,
  status: approvalStatusSchema.parse(row.status),
  reason: row.reason,
  createdBy: row.created_by_name,
  approvedBy: row.approved_by_name,
  rejectionReason: row.rejection_reason,
  createdAt: iso(row.created_at),
  payment: {
    id: row.payment_id,
    receiptNumber: row.receipt_number,
    payerName: row.payer_name,
  },
  amountMinor: Number(row.amount_minor),
});

const ITEM_COLUMNS = sql`
  v.id, v.status, v.reason, cu.name AS created_by_name, au.name AS approved_by_name,
  v.rejection_reason, v.created_at, p.id AS payment_id, p.receipt_number,
  p.payer_name, p.amount_minor::text AS amount_minor`;

const ITEM_JOINS = sql`
  FROM payment_void v
  JOIN payment p ON p.id = v.payment_id AND p.organization_id = v.organization_id
  LEFT JOIN "user" cu ON cu.id = v.created_by
  LEFT JOIN "user" au ON au.id = v.approved_by`;

@Injectable()
export class KyselyPaymentVoidRepository extends PaymentVoidRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster
  ) {
    super();
  }

  withTx<T>(
    scope: PaymentScope,
    userId: string,
    work: (tx: PaymentVoidTx) => Promise<T>
  ): Promise<T> {
    return this.db
      .transaction()
      .execute((trx) =>
        work(new KyselyVoidTx(trx, this.poster, { scope, userId }))
      );
  }

  async findVoid(
    scope: PaymentScope,
    id: string
  ): Promise<PaymentVoidItem | undefined> {
    const { rows } = await sql<ItemRow>`
      SELECT ${ITEM_COLUMNS} ${ITEM_JOINS}
      WHERE v.id = ${id} AND v.organization_id = ${scope.organizationId}
        AND ${anyAllocationInScopeSql('p', scope.campusScope)}`.execute(
      this.db
    );
    return rows[0] && toItem(rows[0]);
  }

  async listVoids(
    scope: PaymentScope,
    query: PaymentVoidListQuery
  ): Promise<VoidPage> {
    const status =
      query.status === undefined ? sql`TRUE` : sql`v.status = ${query.status}`;
    const visible = sql`v.organization_id = ${scope.organizationId}
      AND ${anyAllocationInScopeSql('p', scope.campusScope)}`;
    const [{ rows }, waitingCount] = await Promise.all([
      sql<ItemRow>`
        SELECT ${ITEM_COLUMNS}, (count(*) OVER ())::int AS total_rows ${ITEM_JOINS}
        WHERE ${visible} AND ${status}
        ORDER BY v.created_at DESC, v.id
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`.execute(
        this.db
      ),
      countWaiting(
        this.db,
        sql`${ITEM_JOINS} WHERE ${visible} AND v.status = 'submitted'`
      ),
    ]);
    return {
      items: rows.map((row) => toItem(row)),
      total: rows[0]?.total_rows ?? 0,
      waitingCount,
    };
  }

  async waiting(scope: PaymentScope): Promise<WaitingApproval[]> {
    const { rows } = await sql<
      ItemRow & { created_by: string | null; campus_id: string | null }
    >`
      SELECT ${ITEM_COLUMNS}, v.created_by,
        (
          SELECT ${currentCampusSql('vs')}
          FROM payment_allocation va
          JOIN student vs ON vs.id = va.student_id AND vs.organization_id = va.organization_id
          WHERE va.payment_id = p.id AND va.organization_id = p.organization_id
            AND ${inScope(currentCampusSql('vs'), scope.campusScope)}
          ORDER BY vs.first_name, vs.last_name, vs.id
          LIMIT 1
        ) AS campus_id
      ${ITEM_JOINS}
      WHERE v.organization_id = ${scope.organizationId} AND v.status = 'submitted'
        AND ${anyAllocationInScopeSql('p', scope.campusScope)}
      ORDER BY v.created_at, v.id`.execute(this.db);
    return rows.map((row) => ({
      kind: 'payment_void',
      id: row.id,
      details: `${row.receipt_number} from ${row.payer_name}: ${row.reason}`,
      amountMinor: Number(row.amount_minor),
      amountText: null,
      createdById: row.created_by,
      createdByName: row.created_by_name ?? FORMER_MEMBER_NAME,
      createdAt: iso(row.created_at),
      campusId: row.campus_id,
    }));
  }
}
