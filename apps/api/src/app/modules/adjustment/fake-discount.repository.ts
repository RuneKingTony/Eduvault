import type { StudentDiscountListQuery } from '@eduvault/api-contract';
import type { WaitingApproval } from '../../common/approvals';
import type { AdjustmentScope } from './adjustment.repository';
import {
  DiscountRepository,
  type DiscountPage,
  type DiscountRecord,
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
  approveChanges = true;
  private counter = 0;

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  approvalOn(): Promise<boolean> {
    return Promise.resolve(this.switchOn);
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

  insert(input: NewDiscount): Promise<string> {
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
    return Promise.resolve(id);
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

  approve(
    _scope: AdjustmentScope,
    id: string,
    userId: string
  ): Promise<boolean> {
    const row = this.stored.find((candidate) => candidate.id === id);
    if (
      row !== undefined &&
      this.approveChanges &&
      row.status === 'submitted'
    ) {
      Object.assign(row, { status: 'approved', approvedBy: userId });
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  reject(
    _scope: AdjustmentScope,
    id: string,
    decision: { userId: string; reason: string }
  ): Promise<boolean> {
    const row = this.stored.find((candidate) => candidate.id === id);
    if (row?.status === 'submitted') {
      Object.assign(row, {
        status: 'rejected',
        rejectionReason: decision.reason,
      });
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  end(
    _scope: AdjustmentScope,
    id: string,
    ending: { userId: string; lastTermId: string }
  ): Promise<boolean> {
    const row = this.stored.find((candidate) => candidate.id === id);
    if (row?.status === 'approved') {
      Object.assign(row, {
        toTermId: ending.lastTermId,
        endedBy: ending.userId,
      });
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  waiting(): Promise<WaitingApproval[]> {
    return Promise.resolve([]);
  }
}
