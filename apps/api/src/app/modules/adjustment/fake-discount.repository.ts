import type { StudentDiscountListQuery } from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { WaitingApproval } from '../../common/approvals';
import type { AdjustmentScope } from './adjustment.repository';
import {
  DiscountRepository,
  type DiscountEnding,
  type DiscountPage,
  type DiscountRecord,
  type DiscountTx,
  type LockedDiscount,
  type TermChoice,
  type NewDiscount,
  type FeeTypeCheck,
  type TermInfo,
} from './discount.repository';

interface StoredDiscount extends NewDiscount {
  id: string;
  status: 'submitted' | 'approved' | 'rejected';
  approvedBy: string | null;
  rejectionReason: string | null;
  endedBy: string | null;
}

export class FakeDiscountRepository extends DiscountRepository {
  switchOn = true;
  studentsInScope = new Set<string>();
  terms = new Map<string, TermInfo>();
  current: TermInfo | undefined;
  feeTypes = new Set<string>();
  otherAccounts = new Set<string>();
  stored: StoredDiscount[] = [];
  recorded: ActivityInput[] = [];
  approveChanges = true;
  endChanges = true;
  private counter = 0;
  private actor = '';

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  studentInScope(_scope: AdjustmentScope, studentId: string): Promise<boolean> {
    return Promise.resolve(this.studentsInScope.has(studentId));
  }

  listed: TermChoice[] = [];

  termChoices(): Promise<TermChoice[]> {
    return Promise.resolve(this.listed);
  }

  currentTerm(): Promise<TermInfo | undefined> {
    return Promise.resolve(this.current);
  }

  term(_organizationId: string, termId: string): Promise<TermInfo | undefined> {
    return Promise.resolve(this.terms.get(termId));
  }

  feeType(
    _organizationId: string,
    ledgerAccountId: string
  ): Promise<FeeTypeCheck> {
    if (this.feeTypes.has(ledgerAccountId)) {
      return Promise.resolve('ok');
    }
    return Promise.resolve(
      this.otherAccounts.has(ledgerAccountId) ? 'not_fee_type' : 'missing'
    );
  }

  withTx<T>(
    _scope: AdjustmentScope,
    userId: string,
    work: (tx: DiscountTx) => Promise<T>
  ): Promise<T> {
    this.actor = userId;
    return work(this.tx());
  }

  private tx(): DiscountTx {
    return {
      currency: () => Promise.resolve('NGN'),
      approvalOn: () => Promise.resolve(this.switchOn),
      student: (id) =>
        Promise.resolve(
          this.studentsInScope.has(id)
            ? { id, name: 'Halima Bello', campusId: 'lekki' }
            : undefined
        ),
      insert: (input) => Promise.resolve(this.add(input)),
      lock: (id) => Promise.resolve(this.lockOf(id)),
      approve: (id) => Promise.resolve(this.decide(id, 'approved')),
      reject: (id, reason) =>
        Promise.resolve(this.decide(id, 'rejected', reason)),
      end: (id, ending) => Promise.resolve(this.finish(id, ending)),
      activity: {
        recordMany: (inputs) => {
          this.recorded.push(...inputs);
          return Promise.resolve();
        },
      },
    };
  }

  private add(input: NewDiscount): string {
    this.counter += 1;
    const id = `discount-${this.counter}`;
    this.stored.push({
      ...input,
      id,
      status: input.autoApproved ? 'approved' : 'submitted',
      approvedBy: null,
      rejectionReason: null,
      endedBy: null,
    });
    return id;
  }

  private lockOf(id: string): LockedDiscount | undefined {
    const row = this.stored.find((candidate) => candidate.id === id);
    return (
      row && {
        id: row.id,
        status: row.status,
        createdById: row.userId,
        kind: row.kind,
        value: row.value,
        toTermId: row.toTermId,
        ended: row.endedBy !== null,
        student: {
          id: row.studentId,
          name: 'Halima Bello',
          campusId: 'lekki',
        },
      }
    );
  }

  private finish(id: string, ending: DiscountEnding): boolean {
    const row = this.stored.find((candidate) => candidate.id === id);
    if (row?.status !== 'approved' || !this.endChanges) {
      return false;
    }
    Object.assign(row, {
      toTermId: ending.lastTermId,
      endedBy: ending.userId,
    });
    return true;
  }

  private decide(
    id: string,
    status: 'approved' | 'rejected',
    reason?: string
  ): boolean {
    const row = this.stored.find((candidate) => candidate.id === id);
    if (
      row?.status !== 'submitted' ||
      (status === 'approved' && !this.approveChanges)
    ) {
      return false;
    }
    Object.assign(
      row,
      status === 'approved'
        ? { status, approvedBy: this.actor }
        : { status, rejectionReason: reason }
    );
    return true;
  }

  findById(
    _scope: AdjustmentScope,
    id: string
  ): Promise<DiscountRecord | undefined> {
    const row = this.stored.find((candidate) => candidate.id === id);
    const from = row && this.terms.get(row.fromTermId);
    if (row === undefined || from === undefined) {
      return Promise.resolve(undefined);
    }
    const to = this.termOf(row.toTermId);
    return Promise.resolve({
      createdById: row.userId,
      status: row.status,
      until: to?.position ?? null,
      discount: {
        id: row.id,
        student: {
          id: row.studentId,
          name: 'Halima Bello',
          admissionNumber: 'GF-0007',
        },
        kind: row.kind,
        value: row.value,
        feeType:
          row.ledgerAccountId === null
            ? null
            : { id: row.ledgerAccountId, name: 'Tuition' },
        reason: row.reason,
        fromTerm: { id: from.id, name: from.name },
        toTerm: to === undefined ? null : { id: to.id, name: to.name },
        status: row.status,
        createdBy: row.userId,
        createdAt: '2026-10-17T08:00:00.000Z',
        approvedBy: row.approvedBy,
        rejectionReason: row.rejectionReason,
        endedAt: row.endedBy === null ? null : '2026-10-17T09:00:00.000Z',
      },
    });
  }

  private termOf(termId: string | null): TermInfo | undefined {
    return termId === null ? undefined : this.terms.get(termId);
  }

  list(
    _scope: AdjustmentScope,
    _query: StudentDiscountListQuery
  ): Promise<DiscountPage> {
    return Promise.resolve({ items: [], total: 0, waitingCount: 0 });
  }

  waiting(): Promise<WaitingApproval[]> {
    return Promise.resolve([]);
  }
}
