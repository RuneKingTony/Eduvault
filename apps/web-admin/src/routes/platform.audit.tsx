import { createFileRoute } from '@tanstack/react-router';
import { PlatformAuditPage } from '../pages/platform-audit-page';
import { platformAuditQueryOptions } from '../queries';

export const Route = createFileRoute('/platform/audit')({
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...platformAuditQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: PlatformAuditPage,
});
