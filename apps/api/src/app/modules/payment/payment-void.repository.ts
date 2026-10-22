import type {
  ApprovalStatus,
  PaymentStatus,
  PaymentVoidItem,
  PaymentVoidListQuery,
} from '@eduvault/api-contract';
import type { ActivityRecorder, CampusAmount } from '../../common/activity';
import type { WaitingApproval } from '../../common/approvals';
import type { LedgerLine, PostInput } from '../../common/ledger';
import type { OrgScope } from '../../common/scope';

export interface VoidablePayment {
  id: string;
  receiptNumber: string;
  reference: string;
  payerName: string;
  amountMinor: number;
  status: PaymentStatus;
  paidOn: string;
  entryId: string;
  everyAllocationInScope: boolean;
  storeSale: { id: string; number: string } | null;
}

export interface VoidRecord {
  id: string;
  status: ApprovalStatus;
  reason: string;
  createdBy: string | null;
  payment: VoidablePayment;
}

export interface VoidPage {
  items: PaymentVoidItem[];
  total: number;
  waitingCount: number;
}

export type VoidPost = Omit<PostInput, 'organizationId' | 'postedBy'>;

export interface PaymentVoidTx {
  lockPayment(paymentId: string): Promise<VoidablePayment | undefined>;
  hasOpenVoid(paymentId: string): Promise<boolean>;
  approvalOn(): Promise<boolean>;
  originalLines(entryId: string): Promise<LedgerLine[]>;
  post(entry: VoidPost): Promise<string>;
  insertSubmitted(input: {
    paymentId: string;
    reason: string;
  }): Promise<string>;
  insertApproved(input: {
    paymentId: string;
    reason: string;
    entryId: string;
  }): Promise<string>;
  setPaymentStatus(paymentId: string, status: PaymentStatus): Promise<void>;
  lockVoid(voidId: string): Promise<VoidRecord | undefined>;
  approve(voidId: string, entryId: string): Promise<boolean>;
  reject(voidId: string, reason: string): Promise<boolean>;
  allocationShares(paymentId: string): Promise<CampusAmount[]>;
  readonly activity: ActivityRecorder;
  currency(): Promise<string>;
}

export abstract class PaymentVoidRepository {
  abstract withTx<T>(
    scope: OrgScope,
    userId: string,
    work: (tx: PaymentVoidTx) => Promise<T>
  ): Promise<T>;

  abstract findVoid(
    scope: OrgScope,
    id: string
  ): Promise<PaymentVoidItem | undefined>;

  abstract listVoids(
    scope: OrgScope,
    query: PaymentVoidListQuery
  ): Promise<VoidPage>;

  abstract waiting(scope: OrgScope): Promise<WaitingApproval[]>;
}
