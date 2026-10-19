import type {
  ApprovalStatus,
  DiscountKind,
  StudentDiscount,
  StudentDiscountListQuery,
} from '@eduvault/api-contract';
import type { ActivityRecorder } from '../../common/activity';
import type { WaitingApproval } from '../../common/approvals';
import type { TermPosition } from '../../common/fees';
import type { StudentIdentity } from '../../common/students';
import type { OrgScope } from '../../common/scope';

export interface TermInfo {
  id: string;
  name: string;
  position: TermPosition;
}

export interface TermChoice {
  id: string;
  label: string;
  startsOn: string;
  isCurrent: boolean;
}

export interface NewDiscount {
  organizationId: string;
  userId: string;
  studentId: string;
  kind: DiscountKind;
  value: number;
  ledgerAccountId: string | null;
  fromTermId: string;
  toTermId: string | null;
  reason: string;
  autoApproved: boolean;
}

export interface DiscountRecord {
  discount: StudentDiscount;
  createdById: string | null;
  status: ApprovalStatus;
  until: TermPosition | null;
}

export interface LockedDiscount {
  id: string;
  status: ApprovalStatus;
  createdById: string | null;
  kind: DiscountKind;
  value: number;
  toTermId: string | null;
  ended: boolean;
  student: StudentIdentity;
}

export interface DiscountEnding {
  userId: string;
  lastTermId: string;
}

export interface DiscountTx {
  student(studentId: string): Promise<StudentIdentity | undefined>;
  insert(input: NewDiscount): Promise<string>;
  lock(id: string): Promise<LockedDiscount | undefined>;
  approve(id: string): Promise<boolean>;
  reject(id: string, reason: string): Promise<boolean>;
  end(id: string, ending: DiscountEnding): Promise<boolean>;
  readonly activity: ActivityRecorder;
  currency(): Promise<string>;
  approvalOn(): Promise<boolean>;
}

export type FeeTypeCheck = 'ok' | 'missing' | 'not_fee_type';

export interface DiscountPage {
  items: StudentDiscount[];
  total: number;
  waitingCount: number;
}

export abstract class DiscountRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract studentInScope(scope: OrgScope, studentId: string): Promise<boolean>;

  abstract termChoices(organizationId: string): Promise<TermChoice[]>;

  abstract currentTerm(organizationId: string): Promise<TermInfo | undefined>;

  abstract term(
    organizationId: string,
    termId: string
  ): Promise<TermInfo | undefined>;

  abstract feeType(
    organizationId: string,
    ledgerAccountId: string
  ): Promise<FeeTypeCheck>;

  abstract withTx<T>(
    scope: OrgScope,
    userId: string,
    work: (tx: DiscountTx) => Promise<T>
  ): Promise<T>;

  abstract findById(
    scope: OrgScope,
    id: string
  ): Promise<DiscountRecord | undefined>;

  abstract list(
    scope: OrgScope,
    query: StudentDiscountListQuery
  ): Promise<DiscountPage>;

  abstract waiting(scope: OrgScope): Promise<WaitingApproval[]>;
}
