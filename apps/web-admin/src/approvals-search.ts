import { APPROVAL_PILLARS, type ApprovalPillar } from '@eduvault/api-contract';
import { oneOf, textOf } from '@eduvault/shared';

export interface ApprovalsSearch {
  tab?: ApprovalPillar;
  campus?: string;
}

export const parseApprovalsSearch = (
  search: Record<string, unknown>
): ApprovalsSearch => ({
  tab: oneOf(APPROVAL_PILLARS, search['tab']),
  campus: textOf(search['campus']),
});
