import type {
  Adjustment,
  AdjustmentKind,
  AdjustmentListQuery,
  ApprovalStatus,
} from '@eduvault/api-contract';
import type { WaitingApproval } from '../../common/approvals';
import type { CampusScope } from '../../common/campus-scope';
import type { PostInput } from '../../common/ledger';

export interface AdjustmentScope {
  organizationId: string;
  campusScope: CampusScope;
}

export interface StudentFacts {
  id: string;
  name: string;
  admissionNumber: string;
  campusId: string | null;
  balanceMinor: number;
}

export type CreditAccountCheck =
  | { status: 'missing' | 'not_allowed' }
  | { status: 'ok'; ledgerAccountId: string };

export type SentChargeCheck = 'ok' | 'missing' | 'not_sent';

export type RefundAccountCheck =
  | { status: 'missing' | 'retired' | 'gateway' }
  | { status: 'ok'; ledgerAccountId: string; campusId: string | null };

export interface AdjustmentRecord {
  id: string;
  number: string;
  kind: AdjustmentKind;
  studentId: string;
  invoiceId: string | null;
  ledgerAccountId: string | null;
  moneyAccountId: string | null;
  amountMinor: number;
  reason: string;
  status: ApprovalStatus;
  createdBy: string | null;
}

export interface NewAdjustment {
  id: string;
  number: string;
  kind: AdjustmentKind;
  studentId: string;
  invoiceId: string | null;
  ledgerAccountId: string | null;
  moneyAccountId: string | null;
  amountMinor: number;
  reason: string;
  approvedEntryId: string | null;
}

export interface MoneyAccountPosting {
  ledgerAccountId: string;
  campusId: string | null;
  live: boolean;
}

export interface SystemAccounts {
  receivableId: string;
  badDebtId: string;
}

export type AdjustmentPost = Omit<PostInput, 'organizationId' | 'postedBy'>;

export interface AdjustmentPage {
  items: Adjustment[];
  total: number;
  waitingCount: number;
}

export interface AdjustmentTx {
  lockStudent(studentId: string): Promise<StudentFacts | undefined>;
  approvalOn(kind: AdjustmentKind): Promise<boolean>;
  sentCharge(studentId: string, invoiceId: string): Promise<SentChargeCheck>;
  creditAccount(ledgerAccountId: string | null): Promise<CreditAccountCheck>;
  refundAccount(moneyAccountId: string): Promise<RefundAccountCheck>;
  moneyAccountPosting(
    moneyAccountId: string
  ): Promise<MoneyAccountPosting | undefined>;
  systemAccounts(): Promise<SystemAccounts>;
  nextNumber(year: number): Promise<string>;
  post(entry: AdjustmentPost): Promise<string>;
  insert(input: NewAdjustment): Promise<void>;
  lockAdjustment(id: string): Promise<AdjustmentRecord | undefined>;
  approve(id: string, entryId: string): Promise<boolean>;
  reject(id: string, reason: string): Promise<boolean>;
}

export abstract class AdjustmentRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract withTx<T>(
    scope: AdjustmentScope,
    userId: string,
    work: (tx: AdjustmentTx) => Promise<T>
  ): Promise<T>;

  abstract findById(
    scope: AdjustmentScope,
    id: string
  ): Promise<Adjustment | undefined>;

  abstract list(
    scope: AdjustmentScope,
    query: AdjustmentListQuery
  ): Promise<AdjustmentPage>;

  abstract waiting(scope: AdjustmentScope): Promise<WaitingApproval[]>;
}
