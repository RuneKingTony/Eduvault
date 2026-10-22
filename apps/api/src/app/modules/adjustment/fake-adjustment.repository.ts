import type {
  Adjustment,
  AdjustmentKind,
  AdjustmentListQuery,
} from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { WaitingApproval } from '../../common/approvals';
import type { UsableMoneyAccount } from '../../common/money-accounts';
import {
  AdjustmentRepository,
  type AdjustmentPage,
  type AdjustmentPost,
  type AdjustmentRecord,
  type AdjustmentScope,
  type AdjustmentTx,
  type CreditAccountCheck,
  type NewAdjustment,
  type SentChargeCheck,
  type StudentFacts,
  type SystemAccounts,
} from './adjustment.repository';

interface StoredAdjustment extends AdjustmentRecord {
  approvedBy: string | null;
  rejectionReason: string | null;
  entryId: string | null;
}

export class FakeAdjustmentRepository extends AdjustmentRepository {
  students = new Map<string, StudentFacts>();
  switchedOff = new Set<AdjustmentKind>();
  sentCharges = new Set<string>();
  knownCharges = new Set<string>();
  retiredAccounts = new Set<string>();
  creditAccounts = new Map<string, CreditAccountCheck>();
  refundAccounts = new Map<string, UsableMoneyAccount>();
  stored: StoredAdjustment[] = [];
  posted: AdjustmentPost[] = [];
  recorded: ActivityInput[] = [];
  numbers: string[] = [];
  declined: { id: string; reason: string }[] = [];
  approveChanges = true;
  private nextNo = 1;
  private actor = '';

  seedStudent(student: StudentFacts): void {
    this.students.set(student.id, student);
  }

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  withTx<T>(
    _scope: AdjustmentScope,
    userId: string,
    work: (tx: AdjustmentTx) => Promise<T>
  ): Promise<T> {
    this.actor = userId;
    return work(this.tx());
  }

  private chargeCheck(invoiceId: string): SentChargeCheck {
    if (this.sentCharges.has(invoiceId)) {
      return 'ok';
    }
    return this.knownCharges.has(invoiceId) ? 'not_sent' : 'missing';
  }

  private tx(): AdjustmentTx {
    return { ...this.reads(), ...this.writes() };
  }

  private reads(): Omit<
    AdjustmentTx,
    'post' | 'insert' | 'nextNumber' | 'approve' | 'reject' | 'activity'
  > {
    return {
      currency: () => Promise.resolve('NGN'),
      lockStudent: (id) => Promise.resolve(this.students.get(id)),
      approvalOn: (kind) => Promise.resolve(!this.switchedOff.has(kind)),
      sentCharge: (_student, invoiceId) =>
        Promise.resolve(this.chargeCheck(invoiceId)),
      creditAccount: (id) =>
        Promise.resolve(
          id === null || id === 'discounts-given'
            ? { status: 'ok', ledgerAccountId: 'discounts-given' }
            : (this.creditAccounts.get(id) ?? { status: 'missing' })
        ),
      refundAccount: (id) =>
        Promise.resolve(this.refundAccounts.get(id) ?? { status: 'missing' }),
      moneyAccountPosting: (id) => {
        const account = this.refundAccounts.get(id);
        return Promise.resolve(
          account?.status === 'ok'
            ? {
                ledgerAccountId: account.ledgerAccountId,
                campusId: account.campusId,
                live: !this.retiredAccounts.has(id),
              }
            : undefined
        );
      },
      systemAccounts: (): Promise<SystemAccounts> =>
        Promise.resolve({ receivableId: 'receivable', badDebtId: 'bad-debt' }),
      lockAdjustment: (id) => {
        const row = this.stored.find((candidate) => candidate.id === id);
        const student = row && this.students.get(row.studentId);
        return Promise.resolve(row && student && { ...row, student });
      },
    };
  }

  private writes(): Pick<
    AdjustmentTx,
    'post' | 'insert' | 'nextNumber' | 'approve' | 'reject' | 'activity'
  > {
    return {
      activity: {
        recordMany: (inputs) => {
          this.recorded.push(...inputs);
          return Promise.resolve();
        },
      },
      nextNumber: (year) => {
        const number = `ADJ-${year}-${String(this.nextNo++).padStart(4, '0')}`;
        this.numbers.push(number);
        return Promise.resolve(number);
      },
      post: (entry) => {
        this.posted.push(entry);
        return Promise.resolve(`entry-${this.posted.length}`);
      },
      insert: (input) => {
        this.add(input);
        return Promise.resolve();
      },
      approve: (id, entryId) => {
        const row = this.stored.find((candidate) => candidate.id === id);
        if (row !== undefined && this.approveChanges) {
          Object.assign(row, {
            status: 'approved',
            approvedBy: this.actor,
            entryId,
          });
        }
        return Promise.resolve(this.approveChanges);
      },
      reject: (id, reason) => {
        const row = this.stored.find((candidate) => candidate.id === id);
        if (row !== undefined) {
          Object.assign(row, { status: 'rejected', rejectionReason: reason });
          this.declined.push({ id, reason });
        }
        return Promise.resolve(row !== undefined);
      },
    };
  }

  private add(input: NewAdjustment): void {
    this.stored.push({
      id: input.id,
      number: input.number,
      kind: input.kind,
      studentId: input.studentId,
      invoiceId: input.invoiceId,
      ledgerAccountId: input.ledgerAccountId,
      moneyAccountId: input.moneyAccountId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      status: input.approvedEntryId === null ? 'submitted' : 'approved',
      createdBy: this.actor,
      approvedBy: null,
      rejectionReason: null,
      entryId: input.approvedEntryId,
    });
  }

  findById(
    _scope: AdjustmentScope,
    id: string
  ): Promise<Adjustment | undefined> {
    const row = this.stored.find((candidate) => candidate.id === id);
    const student = row && this.students.get(row.studentId);
    return Promise.resolve(
      row &&
        student && {
          id: row.id,
          number: row.number,
          kind: row.kind,
          student: {
            id: student.id,
            name: student.name,
            admissionNumber: student.admissionNumber,
          },
          amountMinor: row.amountMinor,
          reason: row.reason,
          status: row.status,
          createdBy: row.createdBy,
          createdAt: '2026-10-17T08:00:00.000Z',
          approvedBy: row.approvedBy,
          rejectionReason: row.rejectionReason,
          ledgerAccountId: row.ledgerAccountId,
          moneyAccountId: row.moneyAccountId,
          invoiceId: row.invoiceId,
          journalEntryId: row.entryId,
        }
    );
  }

  list(
    _scope: AdjustmentScope,
    _query: AdjustmentListQuery
  ): Promise<AdjustmentPage> {
    return Promise.resolve({ items: [], total: 0, waitingCount: 0 });
  }

  waiting(): Promise<WaitingApproval[]> {
    return Promise.resolve([]);
  }
}
