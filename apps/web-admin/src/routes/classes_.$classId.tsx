import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { ClassPage } from '../pages/class-page';
import { classQueryOptions, currentTermQueryOptions } from '../queries';

export const Route = createFileRoute('/classes_/$classId')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/classes');
  },
  loader: async ({ context: { queryClient, api }, params: { classId } }) => {
    await Promise.all([
      queryClient
        .query({ ...classQueryOptions(api, classId), staleTime: 'static' })
        .catch(() => undefined),
      queryClient.query({
        ...currentTermQueryOptions(api),
        staleTime: 'static',
      }),
    ]);
  },
  component: ClassRoute,
});

function ClassRoute() {
  const { classId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <ClassPage
      key={classId}
      classId={classId}
      onBack={() => {
        void navigate({ to: '/classes' });
      }}
      onOpenGraduated={() => {
        void navigate({ to: '/students', search: { tab: 'graduated' } });
      }}
      onOpenStartYear={() => {
        void navigate({ to: '/students', search: { dialog: 'start-year' } });
      }}
    />
  );
}
