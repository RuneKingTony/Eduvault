import { useQuery } from '@tanstack/react-query';
import type { ApprovalSummary } from '@eduvault/api-contract';
import { useOptionalPermissions } from '@eduvault/auth-client';
import { can } from '@eduvault/policy';
import { useApi } from '../../api';
import { approvalsSummaryQueryOptions } from '../../queries';

export function useApprovalsSummary(): ApprovalSummary | undefined {
  const access = useOptionalPermissions();
  const enabled =
    access !== null &&
    (can(access.permissions, 'adjustment', 'approve') ||
      can(access.permissions, 'leave', 'approve') ||
      access.acting !== null);
  return useQuery({
    ...approvalsSummaryQueryOptions(useApi()),
    enabled,
  }).data;
}
