import type { ApprovalKind } from '@eduvault/api-contract';
import type { CampusScope } from '../campus-scope';

export interface ApprovalScope {
  organizationId: string;
  campusScope: CampusScope;
}

export interface WaitingApproval {
  kind: ApprovalKind;
  id: string;
  details: string;
  amountMinor: number | null;
  amountText: string | null;
  createdById: string | null;
  createdByName: string;
  createdAt: string;
  campusId: string | null;
}

export interface ApprovalProvider {
  waiting(scope: ApprovalScope): Promise<WaitingApproval[]>;
}

export const FORMER_MEMBER_NAME = 'Someone who has left';
