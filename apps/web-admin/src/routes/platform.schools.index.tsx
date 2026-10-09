import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PlatformSchoolsPage } from '../pages/platform-schools-page';
import { platformSchoolsQueryOptions } from '../queries';

function SchoolsRoute() {
  const navigate = useNavigate();
  return (
    <PlatformSchoolsPage
      onOpenSchool={(schoolId) => {
        void navigate({
          to: '/platform/schools/$schoolId',
          params: { schoolId },
        });
      }}
      onOpenAudit={() => {
        void navigate({ to: '/platform/audit' });
      }}
    />
  );
}

export const Route = createFileRoute('/platform/schools/')({
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...platformSchoolsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: SchoolsRoute,
});
