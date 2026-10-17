import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { ApprovalRulesPage } from '../pages/approval-rules-page';
import { schoolSettingsQueryOptions } from '../queries';

export const Route = createFileRoute('/settings/approvals')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/settings/approvals');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...schoolSettingsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: ApprovalRulesPage,
});
