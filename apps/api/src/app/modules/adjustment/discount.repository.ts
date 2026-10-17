import type {
  ApprovalStatus,
  DiscountKind,
  StudentDiscount,
  StudentDiscountListQuery,
} from '@eduvault/api-contract';
import type { WaitingApproval } from '../../common/approvals';
import type { TermPosition } from '../../common/fees';
import type { AdjustmentScope } from './adjustment.repository';

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

export type FeeTypeCheck = 'ok' | 'missing' | 'not_fee_type';

export interface DiscountPage {
  items: StudentDiscount[];
  total: number;
  waitingCount: number;
}

export abstract class DiscountRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract approvalOn(organizationId: string): Promise<boolean>;

  abstract studentInScope(
    scope: AdjustmentScope,
    studentId: string
  ): Promise<boolean>;

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

  abstract insert(input: NewDiscount): Promise<string>;

  abstract findById(
    scope: AdjustmentScope,
    id: string
  ): Promise<DiscountRecord | undefined>;

  abstract list(
    scope: AdjustmentScope,
    query: StudentDiscountListQuery
  ): Promise<DiscountPage>;

  abstract approve(
    scope: AdjustmentScope,
    id: string,
    userId: string
  ): Promise<boolean>;

  abstract reject(
    scope: AdjustmentScope,
    id: string,
    decision: { userId: string; reason: string }
  ): Promise<boolean>;

  abstract end(
    scope: AdjustmentScope,
    id: string,
    ending: { userId: string; lastTermId: string }
  ): Promise<boolean>;

  abstract waiting(scope: AdjustmentScope): Promise<WaitingApproval[]>;
}
