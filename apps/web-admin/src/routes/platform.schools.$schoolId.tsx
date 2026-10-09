import {
  createFileRoute,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import { useActingActions } from '../acting-actions';
import { PlatformSchoolPage } from '../pages/platform-school-page';
import { platformSchoolQueryOptions } from '../queries';

function SchoolRoute() {
  const { schoolId } = useParams({ from: '/platform/schools/$schoolId' });
  const navigate = useNavigate();
  const actions = useActingActions();
  return (
    <PlatformSchoolPage
      schoolId={schoolId}
      onActInSchool={actions.start}
      onBack={() => {
        void navigate({ to: '/platform/schools' });
      }}
    />
  );
}

export const Route = createFileRoute('/platform/schools/$schoolId')({
  loader: async ({ context: { queryClient, api }, params }) => {
    await queryClient
      .query({
        ...platformSchoolQueryOptions(api, params.schoolId),
        staleTime: 'static',
      })
      .catch(() => undefined);
  },
  component: SchoolRoute,
});
