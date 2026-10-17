import { APPROVAL_PILLARS, type ApprovalPillar } from '@eduvault/api-contract';
import { oneOf } from '@eduvault/shared';

export interface ApprovalsSearch {
  tab?: ApprovalPillar;
}

export const parseApprovalsSearch = (
  search: Record<string, unknown>
): ApprovalsSearch => ({ tab: oneOf(APPROVAL_PILLARS, search['tab']) });
